import type { Appearance } from './appearance.ts';

export const BP = { two: 700, three: 1000, fullSidebar: 1260 };

export function columnsFor(width: number): 1 | 2 | 3 {
  return width >= BP.three ? 3 : width >= BP.two ? 2 : 1;
}

export type NavLayout = {
  position: 'bottom' | 'top' | 'left' | 'right';
  vertical: boolean;
  full: boolean;
  justify: 'flex-start' | 'center' | 'flex-end' | 'space-around';
  labelsBeside: boolean;
};

export function navLayout(width: number, nav: Appearance['nav']): NavLayout {
  const position = nav.position === 'auto' ? (width < BP.two ? 'bottom' : 'left') : nav.position;
  const vertical = position === 'left' || position === 'right';
  const justify = nav.align === 'start' ? 'flex-start'
    : nav.align === 'center' ? 'center'
    : nav.align === 'end' ? 'flex-end'
    : nav.align === 'spread' ? 'space-around'
    : vertical ? 'flex-start' : 'space-around';
  return {
    position,
    vertical,
    full: vertical && width >= BP.fullSidebar && nav.sidebar !== 'icons',
    justify,
    labelsBeside: !vertical && width >= BP.two,
  };
}
