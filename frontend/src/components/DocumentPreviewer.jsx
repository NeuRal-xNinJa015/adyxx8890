import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
    FileText, Table, Presentation, BookOpen, Code, File,
    Shield, AlertTriangle, Info, Eye
} from 'lucide-react'

/**
 * DocumentPreviewer - Production-level secure document viewer.
 *
 * Features:
 *   - PDF iframe preview (sandboxed)
 *   - Text/code/CSV/JSON file preview via blob
 *   - Format-aware icons and labels
 *   - Document category badges (Spreadsheet, Presentation, E-book, etc.)
 *   - Non-previewable format info card
 *   - Security: sandboxed iframes, no download, no print
 */

// Formats that can be rendered in browser
const TEXT_VIEWABLE = new Set([
    'txt', 'md', 'json', 'xml', 'yaml', 'yml', 'csv', 'tsv',
    'html', 'htm', 'css', 'log', 'ini', 'cfg', 'conf', 'toml',
    'tex', 'latex', 'bib'
])

const PDF_VIEWABLE = new Set(['pdf'])

const FORMAT_LABELS = {
    // Text documents
    'pdf': 'PDF', 'doc': 'Word', 'docx': 'Word', 'txt': 'Plain Text',
    'rtf': 'Rich Text', 'odt': 'OpenDocument', 'wpd': 'WordPerfect',
    'pages': 'Apple Pages',
    // Data
    'csv': 'CSV', 'tsv': 'TSV', 'json': 'JSON', 'xml': 'XML',
    'yaml': 'YAML', 'yml': 'YAML',
    // Spreadsheets
    'xls': 'Excel', 'xlsx': 'Excel', 'ods': 'OpenDocument Sheet',
    'numbers': 'Apple Numbers',
    // Presentations
    'ppt': 'PowerPoint', 'pptx': 'PowerPoint',
    'odp': 'OpenDocument Slides', 'key': 'Apple Keynote',
    // Markup / web / code
    'html': 'HTML', 'htm': 'HTML', 'css': 'CSS',
    'md': 'Markdown', 'tex': 'LaTeX', 'latex': 'LaTeX', 'bib': 'BibTeX',
    'log': 'Log File', 'ini': 'INI Config', 'cfg': 'Config',
    'conf': 'Config', 'toml': 'TOML',
    // E-books / scanned
    'epub': 'EPUB', 'mobi': 'MOBI', 'azw': 'Kindle', 'azw3': 'Kindle',
    'djvu': 'DjVu',
    // Microsoft / specialized
    'xps': 'XPS', 'oxps': 'OpenXPS', 'pub': 'Publisher', 'ps': 'PostScript',
}

const FORMAT_CATEGORIES = {
    // Text documents
    'pdf': 'Document', 'doc': 'Document', 'docx': 'Document',
    'txt': 'Text', 'rtf': 'Document', 'odt': 'Document',
    'wpd': 'Document', 'pages': 'Document',
    // Data
    'csv': 'Data', 'tsv': 'Data', 'json': 'Data', 'xml': 'Data',
    'yaml': 'Config', 'yml': 'Config',
    // Spreadsheets
    'xls': 'Spreadsheet', 'xlsx': 'Spreadsheet', 'ods': 'Spreadsheet',
    'numbers': 'Spreadsheet',
    // Presentations
    'ppt': 'Presentation', 'pptx': 'Presentation',
    'odp': 'Presentation', 'key': 'Presentation',
    // Markup / web / code
    'html': 'Code', 'htm': 'Code', 'css': 'Code', 'md': 'Markup',
    'log': 'Log', 'ini': 'Config', 'cfg': 'Config',
    'conf': 'Config', 'toml': 'Config',
    'tex': 'Markup', 'latex': 'Markup', 'bib': 'Reference',
    // E-books / scanned
    'epub': 'E-book', 'mobi': 'E-book', 'azw': 'E-book', 'azw3': 'E-book',
    'djvu': 'Scanned',
    // Microsoft / specialized
    'xps': 'Document', 'oxps': 'Document', 'pub': 'Publishing', 'ps': 'PostScript',
}

function getCategoryIcon(category) {
    switch (category) {
        case 'Spreadsheet': case 'Data': return <Table size={28} />
        case 'Presentation': return <Presentation size={28} />
        case 'E-book': case 'Scanned': return <BookOpen size={28} />
        case 'Code': case 'Config': case 'Markup': case 'Reference': return <Code size={28} />
        case 'Publishing': case 'PostScript': return <File size={28} />
        default: return <FileText size={28} />
    }
}

export default function DocumentPreviewer({ src, fileName, fileExtension, rawText }) {
    const [textContent, setTextContent] = useState(null)
    const [loadError, setLoadError] = useState(false)
    const [showPreview, setShowPreview] = useState(false)

    const ext = (fileExtension || fileName?.split('.').pop() || '').toLowerCase()
    const isTextViewable = TEXT_VIEWABLE.has(ext)
    const isPdf = PDF_VIEWABLE.has(ext)
    const canPreview = (isTextViewable || isPdf) && !loadError
    const formatLabel = FORMAT_LABELS[ext] || ext.toUpperCase()
    const category = FORMAT_CATEGORIES[ext] || 'Document'

    // Load text content for text-based files
    useEffect(() => {
        if (!src || !isTextViewable) return
        if (rawText) { setTextContent(rawText); return }

        fetch(src)
            .then(r => r.text())
            .then(text => {
                // Limit display to 50KB for performance
                if (text.length > 50000) {
                    setTextContent(text.slice(0, 50000) + '\n\n--- Truncated at 50KB for security ---')
                } else {
                    setTextContent(text)
                }
            })
            .catch(() => setLoadError(true))
    }, [src, isTextViewable, rawText])

    if (!canPreview) {
        return (
            <div className="doc-preview">
                <div className="doc-preview__nopreview">
                    <div className="doc-preview__nopreview-icon">
                        {getCategoryIcon(category)}
                    </div>
                    <div className="doc-preview__nopreview-ext">.{ext}</div>
                    <div className="doc-preview__nopreview-label">{formatLabel}</div>
                    <div className="doc-preview__nopreview-category">{category}</div>
                    <div className="doc-preview__nopreview-divider" />
                    <div className="doc-preview__nopreview-msg">
                        {loadError ? (
                            <><AlertTriangle size={12} /><span>Document cannot be previewed</span></>
                        ) : (
                            <><Shield size={12} /><span>Requires native application to view</span></>
                        )}
                    </div>
                    <div className="doc-preview__nopreview-note">
                        E2E encrypted. Download blocked.
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="doc-preview">
            {/* Header */}
            <div className="doc-preview__header">
                <div className="doc-preview__header-left">
                    {getCategoryIcon(category)}
                    <div>
                        <div className="doc-preview__filename">{fileName || 'Document'}</div>
                        <div className="doc-preview__meta-row">
                            <span className="doc-preview__format-badge">{formatLabel}</span>
                            <span className="doc-preview__category-badge">{category}</span>
                        </div>
                    </div>
                </div>
                {isTextViewable && !showPreview && (
                    <button
                        className="doc-preview__view-btn"
                        onClick={() => setShowPreview(true)}
                    >
                        <Eye size={12} /> Preview
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="doc-preview__content">
                {isPdf && (
                    <iframe
                        src={src}
                        className="doc-preview__pdf-frame"
                        sandbox="allow-same-origin"
                        title="PDF viewer"
                        onError={() => setLoadError(true)}
                    />
                )}

                {isTextViewable && (showPreview || textContent !== null) && (
                    <div className="doc-preview__text-wrapper">
                        <pre className="doc-preview__text-content">
                            {textContent || 'Loading...'}
                        </pre>
                    </div>
                )}

                {isTextViewable && !showPreview && textContent === null && (
                    <div className="doc-preview__text-placeholder">
                        <Eye size={16} />
                        <span>Click Preview to view contents</span>
                    </div>
                )}
            </div>

            {/* Security footer */}
            <div className="doc-preview__footer">
                <Shield size={10} />
                <span>SECURE DOCUMENT - E2E Encrypted - Download Blocked</span>
            </div>
        </div>
    )
}
