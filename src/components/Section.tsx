type Props = {
  id: string;
  title?: string;
  children: React.ReactNode;
};

export default function Section({ id, title, children }: Props) {
  return (
    <section id={id} className="scroll-mt-24">
      {title ? (
        <h2 className="text-xl font-semibold text-orange-800 mb-3">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}
