/**
 * ADYX Hybrid Crypto Provider — Post-Quantum Ready
 * 
 * Abstract CryptoProvider interface that enables future integration
 * of post-quantum algorithms (e.g., Kyber) without changing existing code.
 * 
 * Providers:
 *   - ClassicProvider: wraps current ECDH/AES implementation
 *   - HybridProvider: placeholder for ECDH + Kyber combined derivation
 * 
 * Usage:
 *   const provider = getCryptoProvider('classic')  // or 'hybrid' in the future
 *   const { keyPair, publicKeyBase64 } = await provider.generateKeyPair()
 *   const sharedKey = await provider.deriveSharedKey(peerPublicKey)
 *   const encrypted = await provider.encrypt(plaintext)
 */

import SECURITY_CONFIG from './config.js'
import {
    generateECDHKeyPair,
    importECDHPublicKey,
    deriveSharedBits,
    deriveAESKey,
    aesEncrypt,
    aesDecrypt,
    generateSigningKeyPair,
    importVerifyKey,
    sign,
    verify,
} from './cryptoEngine.js'

/**
 * Abstract CryptoProvider interface.
 * All providers must implement these methods.
 */
class CryptoProvider {
    constructor(name) {
        this.name = name
    }

    async generateKeyPair() { throw new Error('Not implemented') }
    async deriveSharedKey(peerPublicKeyBase64) { throw new Error('Not implemented') }
    async encrypt(plaintext) { throw new Error('Not implemented') }
    async decrypt(ciphertext, iv) { throw new Error('Not implemented') }
    async generateSigningKeys() { throw new Error('Not implemented') }
    async sign(data) { throw new Error('Not implemented') }
    async verify(signature, data) { throw new Error('Not implemented') }
    getAlgorithmInfo() { return { name: this.name } }
    destroy() { }
}

/**
 * ClassicProvider — ECDH P-384 + AES-256-GCM + ECDSA P-384.
 * Wraps existing cryptographic primitives.
 */
class ClassicProvider extends CryptoProvider {
    constructor() {
        super('classic')
        this.dhKeyPair = null
        this.sharedKey = null
        this.signingKeyPair = null
        this.peerVerifyKey = null
    }

    async generateKeyPair() {
        const { keyPair, publicKeyBase64 } = await generateECDHKeyPair()
        this.dhKeyPair = keyPair
        return { keyPair, publicKeyBase64 }
    }

    async deriveSharedKey(peerPublicKeyBase64) {
        const peerKey = await importECDHPublicKey(peerPublicKeyBase64)
        const sharedBits = await deriveSharedBits(this.dhKeyPair.privateKey, peerKey)
        this.sharedKey = await deriveAESKey(sharedBits, 'adyx-classic-v1', 'adyx-message-key')
        return this.sharedKey
    }

    async encrypt(plaintext) {
        if (!this.sharedKey) throw new Error('No shared key derived')
        return aesEncrypt(this.sharedKey, plaintext)
    }

    async decrypt(ciphertext, iv) {
        if (!this.sharedKey) throw new Error('No shared key derived')
        return aesDecrypt(this.sharedKey, ciphertext, iv)
    }

    async generateSigningKeys() {
        const { signingKeyPair, verifyKeyBase64 } = await generateSigningKeyPair()
        this.signingKeyPair = signingKeyPair
        return { verifyKeyBase64 }
    }

    async importPeerVerifyKey(base64) {
        this.peerVerifyKey = await importVerifyKey(base64)
    }

    async sign(data) {
        if (!this.signingKeyPair) throw new Error('No signing key')
        return sign(this.signingKeyPair.privateKey, data)
    }

    async verify(signature, data) {
        if (!this.peerVerifyKey) return false
        return verify(this.peerVerifyKey, signature, data)
    }

    getAlgorithmInfo() {
        return {
            name: 'classic',
            keyExchange: 'ECDH P-384',
            encryption: 'AES-256-GCM',
            signature: 'ECDSA P-384',
            hash: 'SHA-384',
            postQuantum: false,
        }
    }

    destroy() {
        this.dhKeyPair = null
        this.sharedKey = null
        this.signingKeyPair = null
        this.peerVerifyKey = null
    }
}

/**
 * HybridProvider — Placeholder for ECDH + Kyber combined key derivation.
 * 
 * In a real implementation, this would:
 *   1. Generate both ECDH and Kyber key pairs
 *   2. Combine both shared secrets (ECDH secret || Kyber secret)
 *   3. Derive the AES key from the combined material
 * 
 * This ensures security even if one algorithm is broken.
 * Currently falls back to ClassicProvider with a compatibility flag.
 */
class HybridProvider extends CryptoProvider {
    constructor() {
        super('hybrid')
        this.classicFallback = new ClassicProvider()
        console.warn('[HybridCrypto] Kyber not yet available — using classic ECDH as fallback')
        console.warn('[HybridCrypto] To enable post-quantum, integrate a Kyber library and update this provider')
    }

    async generateKeyPair() {
        // In the future:
        // 1. const ecdhKeys = await generateECDHKeyPair()
        // 2. const kyberKeys = await kyber.generateKeyPair()
        // 3. Return combined public key: { ecdh: ecdhKeys.publicKeyBase64, kyber: kyberKeys.publicKeyBase64 }
        return this.classicFallback.generateKeyPair()
    }

    async deriveSharedKey(peerPublicKeyBase64) {
        // In the future:
        // 1. const ecdhSecret = await deriveSharedBits(...)
        // 2. const kyberSecret = await kyber.decapsulate(peerKyberKey)
        // 3. const combined = concatBuffers(ecdhSecret, kyberSecret)
        // 4. return deriveAESKey(combined, ...)
        return this.classicFallback.deriveSharedKey(peerPublicKeyBase64)
    }

    async encrypt(plaintext) {
        return this.classicFallback.encrypt(plaintext)
    }

    async decrypt(ciphertext, iv) {
        return this.classicFallback.decrypt(ciphertext, iv)
    }

    async generateSigningKeys() {
        // Future: use Dilithium for post-quantum signatures
        return this.classicFallback.generateSigningKeys()
    }

    async sign(data) {
        return this.classicFallback.sign(data)
    }

    async verify(signature, data) {
        return this.classicFallback.verify(signature, data)
    }

    getAlgorithmInfo() {
        return {
            name: 'hybrid',
            keyExchange: 'ECDH P-384 (+ Kyber placeholder)',
            encryption: 'AES-256-GCM',
            signature: 'ECDSA P-384 (+ Dilithium placeholder)',
            hash: 'SHA-384',
            postQuantum: false,  // Will be true when Kyber is integrated
            kyberReady: false,
            upgradeNote: 'Replace HybridProvider internals with Kyber KEM when available',
        }
    }

    destroy() {
        this.classicFallback.destroy()
    }
}

// ── Factory ──

/**
 * Get a crypto provider by mode.
 * @param {'classic' | 'hybrid'} mode
 * @returns {CryptoProvider}
 */
export function getCryptoProvider(mode) {
    const providerMode = mode || SECURITY_CONFIG.postQuantum.provider || 'classic'

    switch (providerMode) {
        case 'hybrid':
            return new HybridProvider()
        case 'classic':
        default:
            return new ClassicProvider()
    }
}

// Export the base class for extension
export { CryptoProvider, ClassicProvider, HybridProvider }
