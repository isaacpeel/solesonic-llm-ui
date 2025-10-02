import Linkify from 'linkify-react';

const toJsx = (text) => {
  const cleanedText = (text ?? "No Message In Response").replace(/<think>[\s\S]*?<\/think>/g, '');
  const lines = cleanedText.split(/\r\n|\r|\n/);

  const render = {
    link: ({ attributes, content }) => (
      <a
        {...attributes}
        className="jira-issue-link"
        target="_blank"
        rel="noopener noreferrer"
      >
        {content}
      </a>
    ),
  };

  return (
    <div>
      {lines.map((line, index) => (
        <pre
          key={index}
          style={{
            margin: '0.5em 0',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflow: 'break-word',
            width: '100%',
          }}
        >
          <Linkify as="p" render={render}>{line}</Linkify>
        </pre>
      ))}
    </div>
  );
};

export { toJsx };
