export const dynamic = "force-dynamic";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  // SCRUM-574: see the marketing layout — scoping `.dark` below <body> flips the
  // CSS variables but not the colour body already computed from the light
  // theme, so the colours must be re-declared where the dark variables apply.
  return (
    <div
      className="dark min-h-screen bg-background text-foreground"
      style={{ colorScheme: "dark" }}
    >
      {children}
    </div>
  );
}
