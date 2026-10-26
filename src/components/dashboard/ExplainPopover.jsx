import React, { useRef, useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Wraps one part of an example card. Pointing at it (or tapping it on a touch
// screen) shows what it does; the wrapped control itself can't be used.
// Without an explanation, renders its children unchanged.
export default function ExplainPopover({ explanation, className, children }) {
  const [open, setOpen] = useState(false);
  const pointerType = useRef('mouse');

  if (!explanation) return children;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          aria-label={explanation.title}
          className={cn(
            "inline-flex rounded-md cursor-help outline-none ring-offset-2 transition-shadow hover:ring-2 hover:ring-blue-300 focus-visible:ring-2 focus-visible:ring-blue-400",
            open && "ring-2 ring-blue-300",
            className
          )}
          // Capture handlers stop clicks before they reach the wrapped control
          onPointerDownCapture={(e) => {
            pointerType.current = e.pointerType;
            e.stopPropagation();
          }}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(true); }}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setOpen(false); }}
          onClickCapture={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (pointerType.current !== 'mouse') setOpen((o) => !o);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen((o) => !o);
            }
          }}
        >
          <span inert="" className="contents">{children}</span>
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        className="w-64 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <p className="text-sm font-semibold text-slate-900">{explanation.title}</p>
        <p className="mt-1 text-sm text-slate-600 leading-relaxed">{explanation.text}</p>
      </PopoverContent>
    </Popover>
  );
}
