import {render} from '@testing-library/react';
import {describe, it, expect} from 'vitest';
import {MemoryRouter} from 'react-router';

import NewsUpdateBanner from '../../src/interests/NewsUpdateBanner.jsx';

const UPDATE = {id: 'update-1', agentId: 'agent-1', label: 'Formula 1', chatId: 'chat-1', itemCount: 3};

function renderBanner(update) {
    return render(
        <MemoryRouter>
            <NewsUpdateBanner update={update}/>
        </MemoryRouter>
    );
}

const banner = () => document.querySelector('.news-update-banner');

describe('NewsUpdateBanner', () => {
    it('labels a news chat and links to its settings', () => {
        renderBanner(UPDATE);

        expect(banner().textContent).toBe('News update · Formula 1 · 3 sources · Manage');
        expect(banner().querySelector('a').getAttribute('href')).toBe('/settings/interests');
    });

    it('says source in the singular for one', () => {
        renderBanner({...UPDATE, itemCount: 1});

        expect(banner().textContent).toContain('1 source ·');
    });

    it('has no Manage link once the agent was deleted', () => {
        renderBanner({...UPDATE, agentId: null});

        expect(banner().textContent).toBe('News update · Formula 1');
        expect(banner().querySelector('a')).toBeNull();
    });

    it('renders nothing for an ordinary chat', () => {
        renderBanner(null);

        expect(banner()).toBeNull();
    });

    it('renders the label as text', () => {
        renderBanner({...UPDATE, label: '<em>Formula 1</em>'});

        expect(banner().querySelector('em')).toBeNull();
        expect(banner().textContent).toContain('<em>Formula 1</em>');
    });
});
