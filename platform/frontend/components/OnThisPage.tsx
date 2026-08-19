"use client";
import { useEffect, useState } from "react";

/** Section index for a long document.
 *
 *  A privacy policy is not read top to bottom — someone arrives looking for
 *  one clause ("do you keep my data?", "can I get it deleted?") and needs to
 *  see the shape of the document to find it. The current section is tracked so
 *  the reader keeps their place through a long scroll.
 */
export default function OnThisPage({ sections }: { sections: [string, string][] }) {
  const [active, setActive] = useState(sections[0]?.[0] || "");

  useEffect(() => {
    const headings = sections
      .map(([id]) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    if (!headings.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      // top-weighted so a heading counts as "current" once it reaches the
      // upper third, not when it happens to sit dead centre
      { rootMargin: "-80px 0px -66% 0px", threshold: 0 });

    headings.forEach(h => io.observe(h));
    return () => io.disconnect();
  }, [sections]);

  return (
    <nav className="gx-toc" aria-label="On this page">
      <h2 className="gx-label">On this page</h2>
      <ol>
        {sections.map(([id, label]) => (
          <li key={id}>
            <a href={`#${id}`} aria-current={active === id ? "true" : undefined}>{label}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
