"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Check, Loader2, Sparkles } from "lucide-react";
import type { UserPreferences } from "@/lib/db/user-preferences";

interface ModelOption {
  id: string;
  label: string;
  provider: string;
}

interface SettingsFormProps {
  preferences: UserPreferences;
  availableModels: ModelOption[];
}

export function SettingsForm({ preferences, availableModels }: SettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);

  const [selectedModelId, setSelectedModelId] = useState<string>(
    preferences.defaultModelId ?? availableModels[0]?.id ?? "",
  );

  const groupedModels = availableModels.reduce<Record<string, ModelOption[]>>(
    (acc, model) => {
      const provider = model.provider || "Other";
      if (!acc[provider]) acc[provider] = [];
      acc[provider].push(model);
      return acc;
    },
    {},
  );

  const handleSave = useCallback(async () => {
    if (!selectedModelId) return;

    setSaving(true);
    try {
      const response = await fetch("/api/settings/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultModelId: selectedModelId }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to save preferences");
      }

      toast.success("Preferences saved", {
        description: `Default model updated to ${availableModels.find((m) => m.id === selectedModelId)?.label ?? selectedModelId}`,
      });

      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      toast.error("Failed to save", {
        description: err instanceof Error ? err.message : "Please try again",
      });
    } finally {
      setSaving(false);
    }
  }, [selectedModelId, availableModels, router]);

  const currentModelLabel = availableModels.find((m) => m.id === selectedModelId)?.label;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Default Model
        </CardTitle>
        <CardDescription>
          Choose which AI model to use by default for coding tasks. You can always
          override this per-chat.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="model-select">Preferred Model</Label>
          <Select
            value={selectedModelId}
            onValueChange={setSelectedModelId}
            disabled={isPending || saving}
          >
            <SelectTrigger id="model-select" className="w-full">
              <SelectValue placeholder="Select a model">
                {currentModelLabel ?? "Select a model"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(groupedModels).map(([provider, models]) => (
                <div key={provider}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {provider}
                  </div>
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <div className="flex items-center justify-between w-full gap-4">
                        <span>{model.label}</span>
                        {selectedModelId === model.id && (
                          <Check className="h-4 w-4 text-primary shrink-0" />
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
        </div>

        {preferences.defaultModelId && preferences.defaultModelId !== selectedModelId && (
          <p className="text-sm text-muted-foreground">
            Currently set to:{" "}
            <span className="font-medium text-foreground">
              {availableModels.find((m) => m.id === preferences.defaultModelId)?.label ??
                preferences.defaultModelId}
            </span>
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving || isPending}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Preferences"
            )}
          </Button>
          {!saving && selectedModelId === preferences.defaultModelId && (
            <span className="text-sm text-muted-foreground">Already set as default</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
