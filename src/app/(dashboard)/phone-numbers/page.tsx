import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Phone, MoreVertical, Bot } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatPhoneNumber } from "@/lib/utils";
import { BuyPhoneNumberDialog } from "@/components/phone-numbers/buy-dialog";

interface PhoneNumber {
  id: string;
  phone_number: string;
  friendly_name: string | null;
  is_active: boolean;
  assistants: { id: string; name: string } | null;
}

interface Assistant {
  id: string;
  name: string;
}

export default async function PhoneNumbersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: membership } = await supabase
    .from("org_members")
    .select("organization_id")
    .eq("user_id", user!.id)
    .single() as { data: { organization_id: string } | null };

  const orgId = membership?.organization_id || "";

  // Get phone numbers
  const { data: phoneNumbers } = orgId ? await supabase
    .from("phone_numbers")
    .select(`
      *,
      assistants (id, name)
    `)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false }) as { data: PhoneNumber[] | null } : { data: null };

  // Get assistants for assignment
  const { data: assistants } = orgId ? await supabase
    .from("assistants")
    .select("id, name")
    .eq("organization_id", orgId)
    .eq("is_active", true) as { data: Assistant[] | null } : { data: null };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Phone Numbers</h1>
          <p className="text-muted-foreground">
            Purchase and manage phone numbers for your assistants
          </p>
        </div>
        <BuyPhoneNumberDialog assistants={assistants || []} />
      </div>

      {/* Phone Numbers List */}
      {phoneNumbers && phoneNumbers.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {phoneNumbers.map((phoneNumber) => (
            <Card key={phoneNumber.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Phone className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">
                        {formatPhoneNumber(phoneNumber.phone_number)}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {phoneNumber.friendly_name || "Phone Number"}
                      </CardDescription>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Assign Assistant</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive">
                        Release Number
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={phoneNumber.is_active ? "success" : "secondary"}>
                      {phoneNumber.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>

                {phoneNumber.assistants ? (
                  <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
                    <Bot className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {phoneNumber.assistants.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Assigned Assistant
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-3 text-center">
                    <p className="text-sm text-muted-foreground">
                      No assistant assigned
                    </p>
                    <Button variant="link" size="sm" className="mt-1 h-auto p-0">
                      Assign now
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Phone className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">No phone numbers yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Purchase a phone number to start receiving calls
          </p>
          <div className="mt-6">
            <BuyPhoneNumberDialog assistants={assistants || []} />
          </div>
        </Card>
      )}
    </div>
  );
}
