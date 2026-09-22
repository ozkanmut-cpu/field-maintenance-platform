import type { ReactNode } from 'react';

type AccessibleTableProps = {
  caption: string;
  children: ReactNode;
  className?: string;
  stickyColumns?: 1 | 2 | 3;
};

export function AccessibleTable({ caption, children, className = '', stickyColumns }: AccessibleTableProps) {
  const wrapperClassName = ['tableWrap', stickyColumns ? 'stickyTable' : '', className].filter(Boolean).join(' ');
  return <div className={wrapperClassName} tabIndex={0} role="region" data-sticky-columns={stickyColumns}
    aria-label={`${caption}. Yatay kaydırmak için ok tuşlarını veya kaydırma çubuğunu kullanın.`}>
    <table aria-label={caption}>
      <caption className="srOnly">{caption}</caption>
      {children}
    </table>
  </div>;
}
