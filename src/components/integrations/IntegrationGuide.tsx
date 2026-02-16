"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Lightbulb, ExternalLink } from "lucide-react";
import { PlatformIcon } from "./PlatformIcon";
import {
  INTEGRATION_GUIDES,
  DISCOVERY_TIPS,
  getRecommendedPlatforms,
} from "@/lib/integrations/guide-data";
import { SUPPORTED_PLATFORMS } from "@/lib/integrations/types";

interface IntegrationGuideProps {
  industry: string | null;
}

export function IntegrationGuide({ industry }: IntegrationGuideProps) {
  const recommendation = getRecommendedPlatforms(industry);

  return (
    <div className="space-y-6">
      {/* Industry recommendation */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">
            Recommended for {recommendation.label}
          </CardTitle>
          <CardDescription>{recommendation.tip}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {recommendation.tools.map((tool) => (
              <Badge key={tool} variant="outline">
                {tool}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Platform setup guides */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Setup Guides</CardTitle>
          <CardDescription>
            Step-by-step instructions for each platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {INTEGRATION_GUIDES.map((guide) => {
              const platformInfo = SUPPORTED_PLATFORMS.find(
                (p) => p.id === guide.platformId
              );
              return (
                <AccordionItem key={guide.platformId} value={guide.platformId}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3">
                      <PlatformIcon platform={guide.platformId} />
                      <div className="text-left">
                        <p className="font-medium">{guide.name}</p>
                        <p className="text-xs text-muted-foreground font-normal">
                          {guide.description}
                        </p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pl-8">
                      <ol className="space-y-2">
                        {guide.steps.map((step, i) => (
                          <li key={i} className="flex gap-3 text-sm">
                            <span className="font-medium text-muted-foreground shrink-0">
                              {i + 1}.
                            </span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>

                      {platformInfo?.setupUrl && (
                        <a
                          href={platformInfo.setupUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          Open {guide.name}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}

                      {guide.payloadNote && (
                        <div className="mt-3 rounded-lg bg-muted p-3">
                          <pre className="text-xs whitespace-pre-wrap font-mono">
                            {guide.payloadNote}
                          </pre>
                        </div>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>

      {/* Discovery tips */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="h-4 w-4" />
            Not sure what software you use?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {DISCOVERY_TIPS.map((tip, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                <span className="shrink-0">&#8226;</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
