import Linkify from 'linkify-react';

const options ={
    target: "blank_",
    className: "jira-issue-link"
}

const toJsx = (text) => {
  return (
    <Linkify as="span" options={options}>{text}</Linkify>
  );
};

export { toJsx };
