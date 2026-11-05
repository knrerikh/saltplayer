import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import VideoPlayer from '@/renderer/components/VideoPlayer';
import { icons, iconViewBox } from '@/shared/icons';

const drawn = (el: Element | null) => [...el!.querySelectorAll('path')].map((p) => p.getAttribute('d'));

describe('VideoPlayer control bar icons', () => {
  const setup = () =>
    render(<VideoPlayer videoUrl="http://localhost/v.mp4" title="T" onClose={() => {}} onPrev={() => {}} onNext={() => {}} />).container;

  it('draws previous and next from the shared paths', () => {
    const bar = setup();

    expect(drawn(bar.querySelector('[title="Previous Episode"]'))).toEqual([...icons.previous]);
    expect(drawn(bar.querySelector('[title="Next Episode"]'))).toEqual([...icons.next]);
  });

  it('shows play while paused and pause while playing', () => {
    const bar = setup();
    const toggle = () => bar.querySelector('.controls-row .control-button:nth-child(2)');
    const video = bar.querySelector('video')!;

    expect(drawn(toggle())).toEqual([...icons.play]);
    fireEvent.play(video);
    expect(drawn(toggle())).toEqual([...icons.pause]);
    fireEvent.pause(video);
    expect(drawn(toggle())).toEqual([...icons.play]);
  });

  it('has no emoji-capable symbol characters in the control bar', () => {
    expect(setup().querySelector('.controls-row')!.textContent).not.toMatch(/[▶⏸⏮⏭]/);
  });
});

describe('VideoPlayer speaker icon', () => {
  const muteIcon = (container: HTMLElement) => container.querySelector('.mute-button svg')!;
  const paths = (svg: Element) => [...svg.querySelectorAll('path')].map((p) => p.getAttribute('d'));

  it('draws the shared audible speaker', () => {
    const { container } = render(<VideoPlayer videoUrl="http://localhost/v.mp4" title="T" onClose={() => {}} />);

    expect(muteIcon(container).getAttribute('viewBox')).toBe(iconViewBox);
    expect(paths(muteIcon(container))).toEqual([...icons.speakerAudible]);
  });
});
