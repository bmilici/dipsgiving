import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  variant: "dips" | "champions";
  title: string;
  description: string;
  icon: LucideIcon;
  action?: {
    href: string;
    label: string;
  };
};

export default function EmptyState({
  variant,
  title,
  description,
  icon: Icon,
  action,
}: EmptyStateProps) {
  const headingId = `festival-empty-${variant}`;

  return (
    <section
      className={`festival-empty-state festival-empty-state--${variant} festival-card mx-auto max-w-2xl px-6 py-10 text-center sm:px-10 sm:py-12`}
      aria-labelledby={headingId}
    >
      <div className="festival-empty-state-icon mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-gold/50 bg-gold/20 text-forest">
        <Icon className="h-9 w-9" aria-hidden="true" strokeWidth={1.5} />
      </div>
      <h2
        id={headingId}
        className="festival-empty-state-title font-display text-3xl leading-tight text-forest sm:text-4xl"
      >
        {title}
      </h2>
      <p className="festival-empty-state-description mx-auto mt-4 max-w-md text-base leading-7 text-muted-foreground">
        {description}
      </p>
      {action && (
        <Link href={action.href} className="festival-button mt-7">
          {action.label}
        </Link>
      )}
    </section>
  );
}
