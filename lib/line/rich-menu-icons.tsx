/**
 * Icons, drawn rather than described.
 *
 * A rich menu of nothing but words is a wall of Thai at thumbnail size; the
 * glyph is what a customer recognises before they have read anything. Inline
 * SVG because satori renders it and an icon package would be a dependency
 * for six shapes — the same call the landing page made.
 *
 * Two things satori will not do, both found by rendering rather than by
 * reading: it cannot take a Fragment as an SVG child (it tries to stringify
 * the Fragment symbol and throws "Cannot convert a Symbol value to a
 * string"), and it does not inherit presentation attributes from a parent
 * `<g>`. So an icon is a flat array of elements and every one of them
 * carries its own stroke.
 */
export type IconPaths = (colour: string) => React.ReactNode[];

function strokeProps(colour: string) {
  return {
    stroke: colour,
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
}

export function Icon({ paths, size, colour }: { paths: IconPaths; size: number; colour: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {paths(colour)}
    </svg>
  );
}

export const CALENDAR: IconPaths = (c) => [
  <rect key="a" x="3" y="5" width="18" height="16" rx="3" {...strokeProps(c)} />,
  <path key="b" d="M8 3v4" {...strokeProps(c)} />,
  <path key="c" d="M16 3v4" {...strokeProps(c)} />,
  <path key="d" d="M3 10h18" {...strokeProps(c)} />,
];

export const LIST: IconPaths = (c) => [
  <rect key="a" x="3" y="4" width="18" height="17" rx="3" {...strokeProps(c)} />,
  <path key="b" d="M7 9h10" {...strokeProps(c)} />,
  <path key="c" d="M7 13h10" {...strokeProps(c)} />,
  <path key="d" d="M7 17h6" {...strokeProps(c)} />,
];

export const PHOTO: IconPaths = (c) => [
  <rect key="a" x="3" y="4" width="18" height="16" rx="3" {...strokeProps(c)} />,
  <circle key="b" cx="8.5" cy="9.5" r="1.6" {...strokeProps(c)} />,
  <path key="c" d="m4 17 5-5 4 4 2.5-2.5L20 17" {...strokeProps(c)} />,
];

export const PHONE: IconPaths = (c) => [
  <path
    key="a"
    d="M5 3h3.5l1.8 4.4-2.2 1.4a13 13 0 0 0 6.1 6.1l1.4-2.2L20 14.5V18a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3 5.2 2 2 0 0 1 5 3z"
    {...strokeProps(c)}
  />,
];

export const CHART: IconPaths = (c) => [
  <path key="a" d="M4 20V10" {...strokeProps(c)} />,
  <path key="b" d="M10 20V4" {...strokeProps(c)} />,
  <path key="c" d="M16 20v-7" {...strokeProps(c)} />,
  <path key="d" d="M22 20H2" {...strokeProps(c)} />,
];

export const PEOPLE: IconPaths = (c) => [
  <circle key="a" cx="9" cy="8" r="3.2" {...strokeProps(c)} />,
  <path key="b" d="M3 20a6 6 0 0 1 12 0" {...strokeProps(c)} />,
  <path key="c" d="M16 5.5a3 3 0 0 1 0 5.6" {...strokeProps(c)} />,
  <path key="d" d="M18 14.2A5.6 5.6 0 0 1 21 20" {...strokeProps(c)} />,
];

export const SLIDERS: IconPaths = (c) => [
  <path key="a" d="M4 7h10" {...strokeProps(c)} />,
  <path key="b" d="M18 7h2" {...strokeProps(c)} />,
  <circle key="c" cx="16" cy="7" r="2.2" {...strokeProps(c)} />,
  <path key="d" d="M4 17h4" {...strokeProps(c)} />,
  <path key="e" d="M12 17h8" {...strokeProps(c)} />,
  <circle key="f" cx="10" cy="17" r="2.2" {...strokeProps(c)} />,
];
