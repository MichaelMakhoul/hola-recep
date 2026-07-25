export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  // SCRUM-574: `bg-background text-foreground` must be re-declared HERE, not
  // just inherited. globals.css applies them on <body>, which sits ABOVE this
  // wrapper — so `color` resolves against the LIGHT --foreground and is
  // inherited down as an already-computed value, while `bg-card` below resolves
  // against the DARK --card this wrapper switches on. Both are 222.2 84% 4.9%,
  // so prices and feature lists rendered invisible on the pricing cards.
  return (
    <div
      className="dark min-h-screen bg-background text-foreground"
      style={{ colorScheme: "dark" }}
    >
      {children}
    </div>
  );
}
