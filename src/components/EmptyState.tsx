import Link from "next/link";
import { testingAssetPath } from "@/lib/testingMode";

type EmptyStateProps = {
  variant: "dips" | "champions";
  title: string;
  description: string;
  action?: {
    href: string;
    label: string;
  };
};

export default function EmptyState({
  variant,
  title,
  description,
  action,
}: EmptyStateProps) {
  const headingId = `festival-empty-${variant}`;

  return (
    <section
      className={`festival-empty-state festival-empty-state--${variant} festival-card mx-auto max-w-2xl px-6 py-10 text-center sm:px-10 sm:py-12`}
      aria-labelledby={headingId}
    >
      <img
        src={testingAssetPath(variant === "dips" ? "/illustrations/dip-table.svg" : "/illustrations/dip-trophy.svg")}
        alt=""
        aria-hidden="true"
        width={600}
        height={510}
        loading="lazy"
        decoding="async"
        className="mx-auto mb-5 h-auto w-full max-w-64 sm:max-w-72"
      />
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
