import { useEffect, useRef, useState } from "react";

interface MenuItem {
  label: string;
  onClick: () => void;
  icon?: string;
}

interface Props {
  items: MenuItem[];
}

export function MainMenu({ items }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const clickHandler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("mousedown", clickHandler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("mousedown", clickHandler);
    };
  }, [open]);

  return (
    <div className="main-menu" ref={ref}>
      <button
        className="menu-btn"
        onClick={() => setOpen(!open)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        ⋯
      </button>
      {open && (
        <div className="menu-dropdown" role="menu" aria-label="Main menu">
          {items.map((item) => (
            <button
              key={item.label}
              className="menu-item"
              role="menuitem"
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
            >
              {item.icon && <span className="menu-icon" aria-hidden="true">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
