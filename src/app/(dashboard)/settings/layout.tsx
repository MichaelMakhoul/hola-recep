import { SettingsNav } from "./settings-nav";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your business and account settings
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <SettingsNav />
        <div className="space-y-6 lg:col-span-3">{children}</div>
      </div>
    </div>
  );
}
