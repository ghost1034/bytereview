"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useAutomations } from "@/hooks/useAutomations"
import { Bot, Plus, TrendingUp, Clock } from "lucide-react"
import Link from "next/link"

export function AutomationDashboardCard() {
  const { data: automations, isLoading } = useAutomations()

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Automations</CardTitle>
          <Bot className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const enabledCount = automations?.filter(a => a.is_enabled).length || 0
  const totalCount = automations?.length || 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Automations</CardTitle>
        <Bot className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-2xl font-bold">{totalCount}</div>
            <Badge variant={enabledCount > 0 ? "default" : "secondary"}>
              {enabledCount} active
            </Badge>
          </div>
          
          {totalCount === 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                No automations configured yet
              </p>
              <Link href="/dashboard/automations">
                <Button size="sm" className="w-full">
                  <Plus className="w-3 h-3 mr-1" />
                  Create First Automation
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {enabledCount > 0 
                  ? `${enabledCount} automation${enabledCount === 1 ? '' : 's'} monitoring your email`
                  : "All automations are disabled"
                }
              </p>
              <div className="flex gap-1">
                <Link href="/dashboard/automations" className="flex-1">
                  <Button size="sm" variant="outline" className="w-full">
                    Manage
                  </Button>
                </Link>
                <Link href="/dashboard/automations" className="flex-1">
                  <Button size="sm" className="w-full">
                    <Plus className="w-3 h-3 mr-1" />
                    Create
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}