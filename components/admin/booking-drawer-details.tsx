/**
 * The small pieces the booking drawer lays its detail list out with.
 */
export function Row({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-right">
        {href ? (
          <a href={href} className="text-brand underline">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

export function sourceLabel(source: string): string {
  switch (source) {
    case 'online':
      return 'จองออนไลน์';
    case 'walk_in':
      return 'Walk-in';
    case 'phone':
      return 'โทรจอง';
    case 'admin':
      return 'ร้านสร้างเอง';
    default:
      return source;
  }
}
