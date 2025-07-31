import Linkify from 'linkify-react';

const options ={
    target: "blank_",
    className: "jira-issue-link"
}

const toJsx = (text) => {
    // Remove <think> ... </think> blocks from the text
    const cleanedText = (text ?? "No Message In Response").replace(/<think>[\s\S]*?<\/think>/g, '');
    const lines = cleanedText.split(/\r\n|\r|\n/);

    return (
        <div>
            {lines.map((line, index) => {
                return (
                    <pre key={index} style={{ margin: '0.5em 0', whiteSpace: "pre-wrap", wordBreak: 'break-word', overflow: 'break-word', width: '100%' }}>
                        <Linkify as="p" options={options}>{line}</Linkify>
                    </pre>
                );
            })}
        </div>
    );
};

export {toJsx};
