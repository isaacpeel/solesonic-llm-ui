/*
 * The model sometimes reaches for LaTeX arrow notation (`$\rightarrow$`, `\xrightarrow{MODEL}`)
 * to describe a sequence or pipeline. Nothing in the markdown pipeline understands LaTeX math —
 * there is no remark-math/rehype-katex plugin wired in — so it renders literally, dollar signs
 * and all. These are never real math, just arrows, so a small substitution table is enough; a
 * full math renderer would be overkill for it.
 */
const ARROW_REPLACEMENTS = [
    [/\$\\xrightarrow\{([^}]*)}\$/g, (match, label) => `→ (${label})`],
    [/\\xrightarrow\{([^}]*)}/g, (match, label) => `→ (${label})`],
    [/\$\\xleftarrow\{([^}]*)}\$/g, (match, label) => `← (${label})`],
    [/\\xleftarrow\{([^}]*)}/g, (match, label) => `← (${label})`],

    [/\$\\longrightarrow\$/g, '→'],
    [/\\longrightarrow\b/g, '→'],
    [/\$\\longleftarrow\$/g, '←'],
    [/\\longleftarrow\b/g, '←'],
    [/\$\\rightarrow\$/g, '→'],
    [/\\rightarrow\b/g, '→'],
    [/\$\\leftarrow\$/g, '←'],
    [/\\leftarrow\b/g, '←'],
    [/\$\\Rightarrow\$/g, '⇒'],
    [/\\Rightarrow\b/g, '⇒'],
    [/\$\\Leftarrow\$/g, '⇐'],
    [/\\Leftarrow\b/g, '⇐'],
    [/\$\\leftrightarrow\$/g, '↔'],
    [/\\leftrightarrow\b/g, '↔'],
    [/\$\\Leftrightarrow\$/g, '⇔'],
    [/\\Leftrightarrow\b/g, '⇔'],
    [/\$\\to\$/g, '→'],
    [/\\to\b/g, '→'],
];

export function renderLatexArrows(text) {
    if (!text) {
        return text;
    }

    return ARROW_REPLACEMENTS.reduce(
        (currentText, [pattern, replacement]) => currentText.replace(pattern, replacement),
        text
    );
}
