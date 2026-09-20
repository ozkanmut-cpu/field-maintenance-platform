import type { ReactNode } from 'react';

type AccessibleTableProps = {
  caption: string;
  children: ReactNode;
};

export function AccessibleTable({ caption, children }: AccessibleTableProps) {
  return <div className="tableWrap" tabIndex={0} role="region" aria-label={`${caption}. Yatay kaydırmak için ok tuşlarını veya kaydırma çubuğunu kullanın.`}>
    <table>
      <caption className="srOnly">{caption}</caption>
      {children}
    </table>
  </div>;
}
