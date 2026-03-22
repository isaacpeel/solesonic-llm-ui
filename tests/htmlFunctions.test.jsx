import { describe, it, expect } from 'vitest';
import { toJsx } from '../src/util/htmlFunctions.jsx';
import { render } from '@testing-library/react';

describe('htmlFunctions', () => {
  describe('toJsx', () => {
    it('should render text correctly', () => {
      const text = 'Hello, world!';
      const { container } = render(toJsx(text));
      expect(container.textContent).toBe(text);
    });

    it('should keep <think> blocks in text', () => {
      const textWithThink = 'Hello, <think>this should be removed</think> world!';
      const { container } = render(toJsx(textWithThink));
      expect(container.textContent).toBe(textWithThink);
    });

    it('should keep multiple <think> blocks in text', () => {
      const textWithMultipleThinks = 'Hello, <think>remove this</think> world! <think>and this too</think>';
      const { container } = render(toJsx(textWithMultipleThinks));
      expect(container.textContent).toBe(textWithMultipleThinks);
    });

    it('should keep multiline <think> blocks', () => {
      const textWithMultilineThink = 'Hello,\n<think>remove\nthis\nblock</think>\nworld!';
      const { container } = render(toJsx(textWithMultilineThink));
      expect(container.textContent).toBe(textWithMultilineThink);
    });

    it('should handle null or undefined input', () => {
      const { container } = render(toJsx(null));
      expect(container.textContent).toBe('');
    });
  });
});
