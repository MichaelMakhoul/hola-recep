import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PhoneCall, PhoneIncoming, PhoneOutgoing, Play } from "lucide-react";
import { formatPhoneNumber, formatDuration } from "@/lib/utils";
import { format } from "date-fns";

interface Call {
  id: string;
  direction: string;
  status: string;
  caller_phone: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  created_at: string;
  assistants: { id: string; name: string } | null;
  phone_numbers: { id: string; phone_number: string } | null;
}

export default async function CallsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: membership } = await supabase
    .from("org_members")
    .select("organization_id")
    .eq("user_id", user!.id)
    .single() as { data: { organization_id: string } | null };

  const orgId = membership?.organization_id || "";

  // Get calls
  const { data: calls, count } = orgId ? await supabase
    .from("calls")
    .select(`
      *,
      assistants (id, name),
      phone_numbers (id, phone_number)
    `, { count: "exact" })
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50) as { data: Call[] | null; count: number | null } : { data: null, count: 0 };

  // Get stats
  const { data: stats } = orgId ? await supabase
    .from("calls")
    .select("status, duration_seconds")
    .eq("organization_id", orgId) as { data: { status: string; duration_seconds: number | null }[] | null } : { data: null };

  const totalCalls = stats?.length || 0;
  const completedCalls = stats?.filter((c) => c.status === "completed").length || 0;
  const totalMinutes = Math.round(
    (stats?.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) || 0) / 60
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Call History</h1>
        <p className="text-muted-foreground">
          View and analyze all your AI receptionist calls
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCalls}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedCalls}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Minutes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMinutes}</div>
          </CardContent>
        </Card>
      </div>

      {/* Calls Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Calls</CardTitle>
          <CardDescription>
            {count} total calls
          </CardDescription>
        </CardHeader>
        <CardContent>
          {calls && calls.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Direction</TableHead>
                  <TableHead>Caller</TableHead>
                  <TableHead>Assistant</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((call) => (
                  <TableRow key={call.id}>
                    <TableCell>
                      {call.direction === "inbound" ? (
                        <PhoneIncoming className="h-4 w-4 text-green-600" />
                      ) : (
                        <PhoneOutgoing className="h-4 w-4 text-blue-600" />
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {call.caller_phone
                            ? formatPhoneNumber(call.caller_phone)
                            : "Unknown"}
                        </p>
                        {call.phone_numbers && (
                          <p className="text-xs text-muted-foreground">
                            to {formatPhoneNumber(call.phone_numbers.phone_number)}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{call.assistants?.name || "-"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          call.status === "completed"
                            ? "success"
                            : call.status === "failed"
                            ? "destructive"
                            : call.status === "in-progress"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {call.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {call.duration_seconds
                        ? formatDuration(call.duration_seconds)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {format(new Date(call.created_at), "MMM d, h:mm a")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {call.recording_url && (
                          <Button variant="ghost" size="icon" asChild>
                            <a
                              href={call.recording_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Play className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        <Link href={`/calls/${call.id}`}>
                          <Button variant="ghost" size="sm">
                            View
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-12 text-center">
              <PhoneCall className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                No calls yet. Set up an assistant and phone number to start receiving calls.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
