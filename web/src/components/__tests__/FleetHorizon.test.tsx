import { render, screen } from '@testing-library/react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { FleetHorizon } from '../FleetHorizon';
import { fixture, NOW } from '../../data/fixtures';

function renderHorizon(selectedId?: string) {
  return render(
    <MemoryRouter>
      <Tooltip.Provider>
        <FleetHorizon nodes={fixture.nodes} now={NOW} selectedId={selectedId} />
      </Tooltip.Provider>
    </MemoryRouter>,
  );
}

describe('FleetHorizon', () => {
  it('draws one link per node and routes to the node', () => {
    renderHorizon();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(fixture.nodes.length);
    expect(links[0]).toHaveAttribute('href', '/nodes/atlas');
  });

  it('names status and value in the accessible label', () => {
    const { container } = renderHorizon();
    const offline = container.querySelector('.horizon-node[data-status="offline"]');
    expect(offline).toHaveAttribute('aria-label', 'shed: offline, CPU 0.0%');
    const degraded = container.querySelector('.horizon-node[data-status="degraded"]');
    expect(degraded).toHaveAttribute('aria-label', 'studio: degraded, CPU 71.3%');
  });

  it('marks the selected node with the accent tick', () => {
    const { container } = renderHorizon('studio');
    const selected = container.querySelectorAll('[data-selected="true"]');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent('studio');
  });
});
