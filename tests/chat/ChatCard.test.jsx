import {render} from '@testing-library/react';
import {describe, it, expect} from 'vitest';

import ChatCard from '../../src/chat/message/ChatCard.jsx';
import {AI} from '../../src/chat/message/ChatMessage.jsx';

const NEWS_TEXT = [
    '## Verstappen wins in Austin',
    '',
    '*Formula 1 · Oct 21 · 2 sources*',
    '',
    'He won from pole [[1]](https://news.example/a) [[2]](https://news.example/b).',
    '',
    '### Sources',
    '',
    '1. [Race report](https://news.example/a) — news.example',
    '   What this source adds.',
    '2. [[3]](https://news.example/c) — news.example',
].join('\n');

function renderNewsCard() {
    return render(<ChatCard message={{type: AI, text: NEWS_TEXT, ephemeral: true}}/>);
}

const linkWithText = (container, text) => Array.from(container.querySelectorAll('a')).find((link) => link.textContent === text);

describe('ChatCard links', () => {
    it('marks numbered citations', () => {
        const {container} = renderNewsCard();

        expect(linkWithText(container, '[1]').classList.contains('citation-link')).toBe(true);
        expect(linkWithText(container, '[2]').classList.contains('citation-link')).toBe(true);
    });

    it('leaves ordinary links unmarked', () => {
        const {container} = renderNewsCard();

        expect(linkWithText(container, 'Race report').classList.contains('citation-link')).toBe(false);
    });

    it('opens every link in a new tab without an opener', () => {
        const {container} = renderNewsCard();

        for (const link of container.querySelectorAll('a')) {
            expect(link.getAttribute('target')).toBe('_blank');
            expect(link.getAttribute('rel')).toBe('noopener noreferrer');
        }

        expect(container.querySelectorAll('a').length).toBe(4);
    });

    it('renders the news headings and the sources list', () => {
        const {container} = renderNewsCard();

        expect(container.querySelector('h2').textContent).toBe('Verstappen wins in Austin');
        expect(container.querySelector('h3').textContent).toBe('Sources');
        expect(container.querySelectorAll('ol > li')).toHaveLength(2);
        expect(container.querySelector('em').textContent).toBe('Formula 1 · Oct 21 · 2 sources');
    });
});
