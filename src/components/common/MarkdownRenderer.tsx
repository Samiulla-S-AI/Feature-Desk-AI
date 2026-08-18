import React from 'react';

interface MarkdownRendererProps {
    content: string;
    className?: string;
}

/**
 * Markdown Renderer Component
 * Converts markdown text to styled HTML for chatbot responses.
 * Supports: headers, bold, italic, code blocks, inline code, lists, tables, and emojis.
 */
const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
    const renderMarkdown = (text: string): JSX.Element[] => {
        const lines = text.split('\n');
        const elements: JSX.Element[] = [];
        let inCodeBlock = false;
        let codeBlockContent: string[] = [];
        let codeBlockLang = '';
        let inTable = false;
        let tableRows: string[][] = [];
        let listItems: { content: string; indent: number; ordered: boolean; num?: number }[] = [];
        let lineIndex = 0;

        const flushList = () => {
            if (listItems.length > 0) {
                const items = [...listItems];
                listItems = [];
                elements.push(
                    <ul key={`list-${lineIndex}`} className="my-2 space-y-1">
                        {items.map((item, idx) => (
                            <li
                                key={idx}
                                className="flex items-start"
                                style={{ marginLeft: `${item.indent * 16}px` }}
                            >
                                <span className="text-purple-500 mr-2 mt-1">
                                    {item.ordered ? `${item.num}.` : '•'}
                                </span>
                                <span>{renderInline(item.content)}</span>
                            </li>
                        ))}
                    </ul>
                );
            }
        };

        const flushTable = () => {
            if (tableRows.length > 0) {
                const rows = [...tableRows];
                tableRows = [];
                inTable = false;

                // First row is header, skip separator row
                const headerRow = rows[0] || [];
                const dataRows = rows.slice(2); // Skip header and separator

                elements.push(
                    <div key={`table-${lineIndex}`} className="my-3 overflow-x-auto">
                        <table className="min-w-full border border-gray-200 rounded-lg overflow-hidden">
                            <thead className="bg-gray-100">
                                <tr>
                                    {headerRow.map((cell, idx) => (
                                        <th key={idx} className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b">
                                            {renderInline(cell.trim())}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {dataRows.map((row, rowIdx) => (
                                    <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                        {row.map((cell, cellIdx) => (
                                            <td key={cellIdx} className="px-3 py-2 text-sm text-gray-600 border-b border-gray-100">
                                                {renderInline(cell.trim())}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            }
        };

        const processPattern = (
            items: (string | JSX.Element)[],
            pattern: RegExp,
            replacer: (match: string, idx: number, extra?: string) => JSX.Element
        ): (string | JSX.Element)[] => {
            const result: (string | JSX.Element)[] = [];
            let elementIdx = 0;

            items.forEach((item) => {
                if (typeof item === 'string') {
                    let lastIndex = 0;
                    let match;
                    const regex = new RegExp(pattern.source, pattern.flags);

                    while ((match = regex.exec(item)) !== null) {
                        if (match.index > lastIndex) {
                            result.push(item.substring(lastIndex, match.index));
                        }
                        result.push(replacer(match[1], elementIdx++, match[2]));
                        lastIndex = regex.lastIndex;
                    }

                    if (lastIndex < item.length) {
                        result.push(item.substring(lastIndex));
                    }
                } else {
                    result.push(item);
                }
            });

            return result;
        };

        // Inline & Block Math renderer supporting \(...\), \[...\], $...$, and $$...$$
        const renderInlineWithMath = (text: string): JSX.Element => {
            // Split by math delimiters: \(...\), \[...\], $$...$$, $...$
            const parts = text.split(/(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$[^\$\n]+\$)/g);
            return (
                <>
                    {parts.map((part, index) => {
                        if (!part) return null;

                        let mathContent = '';
                        let isBlockMath = false;

                        if (part.startsWith('\\(') && part.endsWith('\\)')) {
                            mathContent = part.slice(2, -2).trim();
                        } else if (part.startsWith('\\[') && part.endsWith('\\]')) {
                            mathContent = part.slice(2, -2).trim();
                            isBlockMath = true;
                        } else if (part.startsWith('$$') && part.endsWith('$$')) {
                            mathContent = part.slice(2, -2).trim();
                            isBlockMath = true;
                        } else if (part.startsWith('$') && part.endsWith('$')) {
                            mathContent = part.slice(1, -1).trim();
                        }

                        if (mathContent) {
                            if (isBlockMath) {
                                return (
                                    <div key={index} className="my-2 p-2 bg-gradient-to-r from-blue-50/80 to-purple-50/80 border border-blue-200/60 rounded-xl text-center font-mono text-sm font-semibold text-blue-900 shadow-2xs">
                                        <span className="text-xs font-bold text-purple-600 mr-2">📐 MATH</span>
                                        {mathContent}
                                    </div>
                                );
                            }
                            return (
                                <span key={index} className="inline-flex items-center font-mono text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-1.5 py-0.5 rounded-md mx-0.5">
                                    <span className="text-[10px] text-purple-500 mr-1 font-bold">fx</span>
                                    {mathContent}
                                </span>
                            );
                        }
                        return <React.Fragment key={index}>{renderInlineMarkdown(part)}</React.Fragment>;
                    })}
                </>
            );
        };

        const renderInlineMarkdown = (text: string): JSX.Element => {
            let result: (string | JSX.Element)[] = [text];

            // Bold: **text**
            result = processPattern(result, /\*\*(.+?)\*\*/g, (match, idx) => (
                <strong key={`bold-${idx}`} className="font-semibold text-gray-900">{match}</strong>
            ));

            // Italic: *text* (must not have surrounding spaces effectively, simplistic approach)
            result = processPattern(result, /\*([^*\n]+)\*/g, (match, idx) => (
                <em key={`italic-${idx}`} className="italic text-gray-800">{match}</em>
            ));

            // Inline code: `code`
            result = processPattern(result, /`([^`]+)`/g, (match, idx) => (
                <code key={`code-${idx}`} className="px-1.5 py-0.5 bg-gray-100 text-purple-600 rounded text-xs font-mono">
                    {match}
                </code>
            ));

            // Links
            result = processPattern(result, /\[([^\]]+)\]\(([^)]+)\)/g, (text, idx, url) => (
                <a key={`link-${idx}`} href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">
                    {text}
                </a>
            ));

            return <>{result}</>;
        }

        const renderInline = renderInlineWithMath;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            lineIndex = i;

            // Code block start
            if (line.startsWith('```')) {
                if (!inCodeBlock) {
                    flushList();
                    flushTable();
                    inCodeBlock = true;
                    codeBlockLang = line.slice(3).trim() || 'text';
                    codeBlockContent = [];
                    continue;
                } else {
                    // Code block end
                    inCodeBlock = false;
                    elements.push(
                        <div key={`codeblock-${i}`} className="my-3">
                            <div className="bg-gray-800 text-gray-100 rounded-lg overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-2 bg-gray-700 border-b border-gray-600">
                                    <span className="text-xs text-gray-400 font-mono">{codeBlockLang}</span>
                                    <button
                                        onClick={() => navigator.clipboard.writeText(codeBlockContent.join('\n'))}
                                        className="text-xs text-gray-400 hover:text-white transition-colors"
                                    >
                                        Copy
                                    </button>
                                </div>
                                <pre className="p-4 overflow-x-auto">
                                    <code className="text-sm font-mono leading-relaxed">
                                        {codeBlockContent.join('\n')}
                                    </code>
                                </pre>
                            </div>
                        </div>
                    );
                    continue;
                }
            }

            // Inside code block
            if (inCodeBlock) {
                codeBlockContent.push(line);
                continue;
            }

            // Math Block detection ($$ ... $$)
            if (line.trim().startsWith('$$') && line.trim().endsWith('$$')) {
                flushList();
                const mathContent = line.trim().slice(2, -2).trim();
                elements.push(
                    <div key={`math-${i}`} className="my-4 p-4 bg-gray-50 border-l-4 border-cyan-500 overflow-x-auto">
                        <code className="text-lg font-mono text-gray-800 italic">
                            {mathContent}
                        </code>
                    </div>
                );
                continue;
            }

            // Table row detection
            if (line.includes('|') && line.trim().startsWith('|')) {
                if (!inTable) {
                    flushList();
                    inTable = true;
                }
                const cells = line.split('|').filter(c => c.trim() !== '');
                tableRows.push(cells);
                continue;
            } else if (inTable) {
                flushTable();
            }

            // Headers
            if (line.startsWith('### ')) {
                flushList();
                elements.push(
                    <h4 key={`h3-${i}`} className="text-base font-semibold text-gray-800 mt-4 mb-2 flex items-center">
                        <span className="w-1 h-4 bg-purple-500 rounded mr-2"></span>
                        {renderInline(line.slice(4))}
                    </h4>
                );
                continue;
            }
            if (line.startsWith('## ')) {
                flushList();
                elements.push(
                    <h3 key={`h2-${i}`} className="text-lg font-bold text-gray-900 mt-4 mb-2 border-b border-gray-200 pb-1">
                        {renderInline(line.slice(3))}
                    </h3>
                );
                continue;
            }
            if (line.startsWith('# ')) {
                flushList();
                elements.push(
                    <h2 key={`h1-${i}`} className="text-xl font-bold text-gray-900 mt-4 mb-3">
                        {renderInline(line.slice(2))}
                    </h2>
                );
                continue;
            }

            // Horizontal rule
            if (line.match(/^-{3,}$/) || line.match(/^_{3,}$/) || line.match(/^\*{3,}$/)) {
                flushList();
                elements.push(<hr key={`hr-${i}`} className="my-4 border-gray-200" />);
                continue;
            }

            // Unordered list items
            const ulMatch = line.match(/^(\s*)[-*•]\s+(.+)$/);
            if (ulMatch) {
                listItems.push({
                    content: ulMatch[2],
                    indent: Math.floor(ulMatch[1].length / 2),
                    ordered: false
                });
                continue;
            }

            // Ordered list items
            const olMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
            if (olMatch) {
                listItems.push({
                    content: olMatch[3],
                    indent: Math.floor(olMatch[1].length / 2),
                    ordered: true,
                    num: parseInt(olMatch[2])
                });
                continue;
            }

            // Flush list before regular paragraph
            flushList();

            // Empty line
            if (line.trim() === '') {
                elements.push(<div key={`space-${i}`} className="h-2" />);
                continue;
            }

            // Regular paragraph
            elements.push(
                <p key={`p-${i}`} className="text-sm text-gray-700 leading-relaxed my-1">
                    {renderInline(line)}
                </p>
            );
        }

        // Flush any remaining items
        flushList();
        flushTable();

        return elements;
    };

    return (
        <div className={`markdown-content ${className}`}>
            {renderMarkdown(content)}
        </div>
    );
};

export default MarkdownRenderer;
