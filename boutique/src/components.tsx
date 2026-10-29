import { useEffect, useRef } from "preact/hooks";
import type { ComponentChildren } from "preact";
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    search: "m21 21-5-5M19 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
    bag: "M5 7h14l1 14H4L5 7Zm3 0V5a4 4 0 0 1 8 0v2",
    arrow: "M4 12h16m-6-6 6 6-6 6",
    close: "m6 6 12 12M6 18 18 6",
    sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    pin: "M12 22S4 14 4 9a8 8 0 0 1 16 0c0 5-8 13-8 13ZM15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
    check: "m5 12 4 4L19 6",
    truck:
      "M1 5h13v12H1V5Zm13 4h5l4 5v3h-9M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0m13 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
    clock: "M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
    heart: "M20 5c-4-4-8 1-8 1S8 1 4 5c-6 6 8 16 8 16S26 11 20 5",
    leaf: "M20 3C7 1 2 8 6 15s15 3 14-12ZM4 21 16 7",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.bag} />
    </svg>
  );
}
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      class={wide ? "dialog wide" : "dialog"}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div class="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <button class="icon-button" aria-label="Fermer" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div class="dialog-body">{children}</div>
    </dialog>
  );
}
export function Garment({ kind = "neuf" }: { kind?: string }) {
  return (
    <div
      class={`garment ${kind}`}
      role="img"
      aria-label="Illustration de démonstration, photo réelle à ajouter"
    >
      <svg viewBox="0 0 240 240" aria-hidden="true">
        <path
          d="m84 57-40 24 23 40 20-11-9 89h84l-9-89 20 11 23-40-40-24c-7 24-45 24-52 0Z"
          fill="currentColor"
        />
        <path
          d="M94 63q26 26 52 0M120 91v108M96 117l-4 62m52-62 4 62"
          fill="none"
          stroke="white"
          stroke-opacity=".35"
          stroke-width="2"
        />
        <path
          d="M120 34v-6c0-10 14-10 14 0 0 5-7 8-14 12L74 62h92l-46-22"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
        />
      </svg>
      <span>PHOTO À AJOUTER · DÉMO</span>
    </div>
  );
}
export function Photo({
  url,
  name,
  kind,
}: {
  url: string;
  name: string;
  kind?: string;
}) {
  const ref = useRef<HTMLImageElement>(null);
  return url ? (
    <div class="product-photo">
      <img
        ref={ref}
        src={url}
        alt={name}
        width="480"
        height="560"
        loading="lazy"
        decoding="async"
        onError={() => {
          if (ref.current) {
            ref.current.removeAttribute("src");
            ref.current.alt = "Photo indisponible";
          }
        }}
      />
    </div>
  ) : (
    <Garment kind={kind} />
  );
}
