/**
 * Lightweight, safe regex-based markdown parser
 * Supports headers, bold, italics, lists (unordered and ordered), blockquotes,
 * code blocks, inline code, links, and paragraphs.
 */
export function renderMarkdown(markdown: string): string {
    if (!markdown) return '';

    const lines = markdown.split('\n');
    let html = '';
    let inList = false;
    let listType: 'ul' | 'ol' | null = null;
    let inCodeBlock = false;
    let codeContent = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Code Blocks
        if (line.trim().startsWith('```')) {
            if (inCodeBlock) {
                // End of code block
                html += `<pre class="bg-slate-900 text-slate-100 p-4 rounded-xl font-mono text-xs overflow-x-auto my-4 border border-slate-800"><code>${codeContent}</code></pre>`;
                codeContent = '';
                inCodeBlock = false;
            } else {
                // Start of code block
                inCodeBlock = true;
            }
            continue;
        }

        if (inCodeBlock) {
            // Escape HTML characters inside code blocks
            const escapedCodeLine = line
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            codeContent += escapedCodeLine + '\n';
            continue;
        }

        // Horizontal Rules
        if (line.trim() === '---' || line.trim() === '***' || line.trim() === '___') {
            if (inList) {
                html += listType === 'ul' ? '</ul>' : '</ol>';
                inList = false;
                listType = null;
            }
            html += '<hr class="my-6 border-gray-200" />';
            continue;
        }

        // Headers
        const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
        if (headerMatch) {
            if (inList) {
                html += listType === 'ul' ? '</ul>' : '</ol>';
                inList = false;
                listType = null;
            }
            const level = headerMatch[1].length;
            const text = parseInlineMarkdown(headerMatch[2]);
            const sizes = [
                'text-2xl font-bold text-gray-900 mt-6 mb-3', // h1
                'text-xl font-bold text-gray-900 mt-5 mb-2.5', // h2
                'text-lg font-bold text-gray-900 mt-4 mb-2', // h3
                'text-md font-semibold text-gray-900 mt-3 mb-1.5', // h4
                'text-sm font-semibold text-gray-900 mt-2 mb-1', // h5
                'text-xs font-semibold text-gray-900 mt-2 mb-1' // h6
            ];
            const sizeClass = sizes[level - 1] || sizes[2];
            html += `<h${level} class="${sizeClass}">${text}</h${level}>`;
            continue;
        }

        // Blockquotes
        const quoteMatch = line.match(/^>\s*(.*)$/);
        if (quoteMatch) {
            if (inList) {
                html += listType === 'ul' ? '</ul>' : '</ol>';
                inList = false;
                listType = null;
            }
            const text = parseInlineMarkdown(quoteMatch[1]);
            html += `<blockquote class="border-l-4 border-green-500 pl-4 py-1 my-3 bg-green-50/50 text-gray-700 italic rounded-r-lg">${text}</blockquote>`;
            continue;
        }

        // Unordered Lists
        const ulMatch = line.match(/^\s*[-*+]\s+(.*)$/);
        if (ulMatch) {
            if (!inList || listType !== 'ul') {
                if (inList) {
                    html += listType === 'ul' ? '</ul>' : '</ol>';
                }
                html += '<ul class="list-disc pl-6 space-y-1 my-3">';
                inList = true;
                listType = 'ul';
            }
            const text = parseInlineMarkdown(ulMatch[1]);
            html += `<li>${text}</li>`;
            continue;
        }

        // Ordered Lists
        const olMatch = line.match(/^\s*(\d+)\.\s+(.*)$/);
        if (olMatch) {
            if (!inList || listType !== 'ol') {
                if (inList) {
                    html += listType === 'ul' ? '</ul>' : '</ol>';
                }
                html += '<ol class="list-decimal pl-6 space-y-1 my-3">';
                inList = true;
                listType = 'ol';
            }
            const text = parseInlineMarkdown(olMatch[2]);
            html += `<li>${text}</li>`;
            continue;
        }

        // Paragraphs / Blank lines
        if (line.trim() === '') {
            if (inList) {
                html += listType === 'ul' ? '</ul>' : '</ol>';
                inList = false;
                listType = null;
            }
            html += '<div class="h-2"></div>';
        } else {
            if (inList) {
                html += listType === 'ul' ? '</ul>' : '</ol>';
                inList = false;
                listType = null;
            }
            const text = parseInlineMarkdown(line);
            html += `<p class="mb-3 text-gray-800 leading-relaxed font-sans">${text}</p>`;
        }
    }

    // Close any unclosed list at the end
    if (inList) {
        html += listType === 'ul' ? '</ul>' : '</ol>';
    }

    return html;
}

function parseInlineMarkdown(text: string): string {
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Bold (**text** or __text__)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // Italics (*text* or _text_)
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

    // Inline Code (`code`)
    html = html.replace(/`([^`]+)`/g, '<code class="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-mono text-xs text-red-650 font-semibold">$1</code>');

    // Links ([text](url))
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-green-600 hover:text-green-700 hover:underline font-semibold">$1</a>');

    return html;
}
