/**
 * Placeholder UsageStats component
 * Will be replaced with actual usage tracking when Stripe billing is implemented
 */
'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function UsageStats() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Usage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Plan</span>
          <Badge variant="secondary">Free</Badge>
        </div>
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground">
            Usage tracking will be available when billing is implemented
          </p>
        </div>
      </CardContent>
    </Card>
  )
}