import './McpTool.css';

function McpTool({
                     inputValue,
                     ghostText,
                 }) {
    return (
        <div className="ghost-text-overlay" aria-hidden="true">
            <span className="ghost-text-hidden">{inputValue}</span>
            <span className="ghost-text-visible">{ghostText}</span>
        </div>
    )
}

export default McpTool;