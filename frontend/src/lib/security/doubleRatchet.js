/**
 * ADYX Double Ratchet — Perfect Forward Secrecy
 * 
 * Implements a simplified Double Ratchet protocol:
 *   - DH Ratchet: new ECDH key pair on each send/receive direction change
 *   - Symmetric Ratchet: chain key → message key via HKDF
 *   - Skipped message key cache (handles out-of-order delivery)
 *   - Message counters for replay protection
 * 
 * Based on Signal Protocol's Double Ratchet Algorithm.
 * Uses ECDH P-384 + AES-256-GCM + HKDF-SHA-384 via Web Crypto API.
 */

import {
    generateECDHKeyPair,
    importECDHPublicKey,
    deriveSharedBits,
    deriveAESKey,
    deriveHKDFBits,
    aesEncrypt,
    aesDecrypt,
    arrayBufferToBase64,
    base64ToArrayBuffer,
    concatBuffers
} from './cryptoEngine.js'

const MAX_SKIP = 100    // Max skipped message keys to cache
const CHAIN_SALT = 'adyx-double-ratchet-chain-v1'
const ROOT_SALT = 'adyx-double-ratchet-root-v1'
const MSG_INFO = 'adyx-msg-key'
const CHAIN_INFO = 'adyx-chain-key'

/**
 * DoubleRatchet state object.
 * Manages the ratchet lifecycle for a single peer session.
 */
export class DoubleRatchet {
    constructor() {
        // DH ratchet keys
        this.dhKeyPair = null          // Our current DH key pair
        this.peerDHPublicKey = null     // Peer's current DH public key
        this.peerDHPublicKeyB64 = null  // Base64 of peer's DH public key

        // Root key (shared secret evolves with each DH ratchet)
        this.rootKey = null             // ArrayBuffer

        // Sending chain
        this.sendChainKey = null        // ArrayBuffer
        this.sendCounter = 0

        // Receiving chain
        this.recvChainKey = null        // ArrayBuffer
        this.recvCounter = 0

        // Skipped message keys: Map<"pubkey:counter" → CryptoKey>
        this.skippedKeys = new Map()

        // State tracking
        this.initialized = false
        this.previousSendCount = 0
    }

    /**
     * Initialize as the session initiator (Alice).
     * Call after receiving peer's initial public key.
     * 
     * @param {ArrayBuffer} sharedSecret - Initial ECDH shared secret
     * @param {string} peerPublicKeyB64 - Peer's initial DH public key (base64)
     */
    async initAsInitiator(sharedSecret, peerPublicKeyB64) {
        // Generate our first ratchet DH key pair
        const { keyPair, publicKeyBase64 } = await generateECDHKeyPair()
        this.dhKeyPair = keyPair
        this.dhPublicKeyB64 = publicKeyBase64

        // Store peer's public key
        this.peerDHPublicKeyB64 = peerPublicKeyB64
        this.peerDHPublicKey = await importECDHPublicKey(peerPublicKeyB64)

        // Derive root key from initial shared secret
        this.rootKey = sharedSecret

        // Perform initial DH ratchet step to get send chain
        await this._dhRatchetStep()

        this.initialized = true
        console.log('[DoubleRatchet] Initialized as initiator')
    }

    /**
     * Initialize as the session responder (Bob).
     * Call with shared secret — will send public key to peer.
     * 
     * @param {ArrayBuffer} sharedSecret - Initial ECDH shared secret
     * @param {object} dhKeyPair - Our DH key pair (already generated during key exchange)
     * @param {string} publicKeyB64 - Our public key base64
     */
    async initAsResponder(sharedSecret, dhKeyPair, publicKeyB64) {
        this.dhKeyPair = dhKeyPair
        this.dhPublicKeyB64 = publicKeyB64
        this.rootKey = sharedSecret

        // Responder starts without a send chain — waits for first message from initiator
        // The send chain will be created on first send after receiving a message
        this.sendChainKey = await deriveHKDFBits(
            sharedSecret,
            CHAIN_SALT,
            'adyx-initial-send-chain'
        )
        this.recvChainKey = null

        this.initialized = true
        console.log('[DoubleRatchet] Initialized as responder')
    }

    /**
     * Encrypt a message using the current sending chain.
     * Returns the encrypted envelope { header, ciphertext, iv }.
     */
    async encrypt(plaintext) {
        if (!this.initialized) throw new Error('DoubleRatchet not initialized')

        // Derive message key from send chain
        const { messageKey, nextChainKey } = await this._ratchetChain(this.sendChainKey)
        this.sendChainKey = nextChainKey

        // Encrypt with message key
        const aesKey = await deriveAESKey(messageKey, CHAIN_SALT, MSG_INFO)
        const { ciphertext, iv } = await aesEncrypt(aesKey, plaintext)

        const header = {
            dhPublicKey: this.dhPublicKeyB64,
            previousCounter: this.previousSendCount,
            counter: this.sendCounter
        }

        this.sendCounter++

        return { header, ciphertext, iv }
    }

    /**
     * Decrypt a message using the ratchet.
     * Handles DH ratchet advancement and skipped messages.
     */
    async decrypt(header, ciphertext, iv) {
        if (!this.initialized) throw new Error('DoubleRatchet not initialized')

        // Check skipped message keys first
        const skipKey = `${header.dhPublicKey}:${header.counter}`
        if (this.skippedKeys.has(skipKey)) {
            const messageKey = this.skippedKeys.get(skipKey)
            this.skippedKeys.delete(skipKey)
            return aesDecrypt(messageKey, ciphertext, iv)
        }

        // Check if peer sent a new DH public key (DH ratchet step needed)
        if (header.dhPublicKey !== this.peerDHPublicKeyB64) {
            // Skip any missed messages in the current receiving chain
            await this._skipMessages(header.previousCounter)

            // Perform DH ratchet with peer's new public key
            this.peerDHPublicKeyB64 = header.dhPublicKey
            this.peerDHPublicKey = await importECDHPublicKey(header.dhPublicKey)

            // Derive new receiving chain from root key + DH
            const dhOut = await deriveSharedBits(this.dhKeyPair.privateKey, this.peerDHPublicKey)
            const { rootKey: newRootKey, chainKey: newRecvChainKey } = await this._kdfRootKey(this.rootKey, dhOut)
            this.rootKey = newRootKey
            this.recvChainKey = newRecvChainKey
            this.recvCounter = 0

            // Generate new DH key pair for our next send
            const { keyPair, publicKeyBase64 } = await generateECDHKeyPair()
            this.dhKeyPair = keyPair
            this.dhPublicKeyB64 = publicKeyBase64

            // Derive new sending chain
            const dhOut2 = await deriveSharedBits(this.dhKeyPair.privateKey, this.peerDHPublicKey)
            const { rootKey: newRootKey2, chainKey: newSendChainKey } = await this._kdfRootKey(this.rootKey, dhOut2)
            this.rootKey = newRootKey2
            this.sendChainKey = newSendChainKey
            this.previousSendCount = this.sendCounter
            this.sendCounter = 0
        }

        // Skip any messages we haven't received yet in this chain
        await this._skipMessages(header.counter)

        // Derive message key from receiving chain
        const { messageKey, nextChainKey } = await this._ratchetChain(this.recvChainKey)
        this.recvChainKey = nextChainKey
        this.recvCounter++

        // Decrypt
        const aesKey = await deriveAESKey(messageKey, CHAIN_SALT, MSG_INFO)
        return aesDecrypt(aesKey, ciphertext, iv)
    }

    /**
     * Get our current DH public key for transmission.
     */
    getPublicKey() {
        return this.dhPublicKeyB64
    }

    /**
     * Check if the ratchet is ready to use.
     */
    isReady() {
        return this.initialized
    }

    /**
     * Destroy all ratchet state — secure wipe.
     */
    destroy() {
        this.dhKeyPair = null
        this.peerDHPublicKey = null
        this.peerDHPublicKeyB64 = null
        this.rootKey = null
        this.sendChainKey = null
        this.recvChainKey = null
        this.sendCounter = 0
        this.recvCounter = 0
        this.previousSendCount = 0
        this.skippedKeys.clear()
        this.initialized = false
        console.log('[DoubleRatchet] State destroyed')
    }

    // ── Private Methods ──

    /**
     * Perform a DH ratchet step — advance root key and derive new send chain.
     */
    async _dhRatchetStep() {
        const dhOut = await deriveSharedBits(this.dhKeyPair.privateKey, this.peerDHPublicKey)
        const { rootKey, chainKey } = await this._kdfRootKey(this.rootKey, dhOut)
        this.rootKey = rootKey
        this.sendChainKey = chainKey
        this.previousSendCount = this.sendCounter
        this.sendCounter = 0
    }

    /**
     * KDF for root key: derives new root key + chain key from old root + DH output.
     */
    async _kdfRootKey(rootKey, dhOutput) {
        const combined = concatBuffers(rootKey, dhOutput)
        const newRootKey = await deriveHKDFBits(combined, ROOT_SALT, 'adyx-root-ratchet', 256)
        const chainKey = await deriveHKDFBits(combined, ROOT_SALT, 'adyx-chain-derive', 256)
        return { rootKey: newRootKey, chainKey }
    }

    /**
     * Symmetric ratchet: derive message key + next chain key from current chain key.
     */
    async _ratchetChain(chainKey) {
        const messageKey = await deriveHKDFBits(chainKey, CHAIN_SALT, MSG_INFO, 256)
        const nextChainKey = await deriveHKDFBits(chainKey, CHAIN_SALT, CHAIN_INFO, 256)
        return { messageKey, nextChainKey }
    }

    /**
     * Cache skipped message keys for out-of-order delivery.
     */
    async _skipMessages(untilCounter) {
        if (!this.recvChainKey) return
        if (this.recvCounter >= untilCounter) return

        // Safety cap
        if (untilCounter - this.recvCounter > MAX_SKIP) {
            console.warn('[DoubleRatchet] Too many skipped messages — capping at', MAX_SKIP)
            return
        }

        while (this.recvCounter < untilCounter) {
            const { messageKey, nextChainKey } = await this._ratchetChain(this.recvChainKey)
            this.recvChainKey = nextChainKey

            const aesKey = await deriveAESKey(messageKey, CHAIN_SALT, MSG_INFO)
            const skipKey = `${this.peerDHPublicKeyB64}:${this.recvCounter}`
            this.skippedKeys.set(skipKey, aesKey)

            this.recvCounter++

            // Evict oldest if over limit
            if (this.skippedKeys.size > MAX_SKIP) {
                const oldest = this.skippedKeys.keys().next().value
                this.skippedKeys.delete(oldest)
            }
        }
    }
}
