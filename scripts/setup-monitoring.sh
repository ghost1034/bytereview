#!/bin/bash
# CPAAutomation Monitoring Setup Script
# Sets up Cloud Monitoring, logging, and alerting

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_ID="ace-rider-383100"
REGION="us-central1"
NOTIFICATION_EMAIL="admin@cpaautomation.ai"

echo -e "${BLUE}📊 Setting up monitoring for CPAAutomation...${NC}"
echo -e "${BLUE}Project: ${PROJECT_ID}${NC}"
echo -e "${BLUE}Notification email: ${NOTIFICATION_EMAIL}${NC}"
echo ""

# Function to create notification channel
create_notification_channel() {
    local email=$1
    
    echo -e "${YELLOW}📧 Creating notification channel for ${email}...${NC}"
    
    # Check if notification channel already exists
    local existing_channel=$(gcloud alpha monitoring channels list --filter="displayName:'Email - ${email}'" --format="value(name)" 2>/dev/null || echo "")
    
    if [ -n "$existing_channel" ]; then
        echo -e "${GREEN}✅ Notification channel already exists: ${existing_channel}${NC}"
        echo "$existing_channel"
        return 0
    fi
    
    # Create notification channel
    local channel_config=$(cat <<EOF
{
  "type": "email",
  "displayName": "Email - ${email}",
  "labels": {
    "email_address": "${email}"
  }
}
EOF
)
    
    local channel_name=$(echo "$channel_config" | gcloud alpha monitoring channels create --channel-content-from-file=- --format="value(name)")
    echo -e "${GREEN}✅ Created notification channel: ${channel_name}${NC}"
    echo "$channel_name"
}

# Function to create alert policy
create_alert_policy() {
    local policy_name=$1
    local policy_config=$2
    
    echo -e "${YELLOW}🚨 Creating alert policy: ${policy_name}...${NC}"
    
    # Check if policy already exists
    local existing_policy=$(gcloud alpha monitoring policies list --filter="displayName:'${policy_name}'" --format="value(name)" 2>/dev/null || echo "")
    
    if [ -n "$existing_policy" ]; then
        echo -e "${GREEN}✅ Alert policy already exists: ${policy_name}${NC}"
        return 0
    fi
    
    # Create alert policy
    echo "$policy_config" | gcloud alpha monitoring policies create --policy-from-file=-
    echo -e "${GREEN}✅ Created alert policy: ${policy_name}${NC}"
}

# Enable monitoring APIs
echo -e "${YELLOW}📡 Enabling monitoring APIs...${NC}"
gcloud services enable monitoring.googleapis.com
gcloud services enable logging.googleapis.com
echo -e "${GREEN}✅ Monitoring APIs enabled${NC}"
echo ""

# Create notification channel
echo -e "${BLUE}=== Setting Up Notification Channels ===${NC}"
NOTIFICATION_CHANNEL=$(create_notification_channel $NOTIFICATION_EMAIL)
echo ""

# Create alert policies
echo -e "${BLUE}=== Creating Alert Policies ===${NC}"

# 1. High Error Rate Alert
echo -e "${YELLOW}Creating High Error Rate alert...${NC}"
HIGH_ERROR_RATE_POLICY=$(cat <<EOF
{
  "displayName": "CPAAutomation - High Error Rate",
  "documentation": {
    "content": "Alert when error rate exceeds 5% for Cloud Run services"
  },
  "conditions": [
    {
      "displayName": "High error rate condition",
      "conditionThreshold": {
        "filter": "resource.type=\"cloud_run_revision\" AND resource.label.service_name=~\"cpa-.*\" AND metric.type=\"run.googleapis.com/request_count\"",
        "aggregations": [
          {
            "alignmentPeriod": "300s",
            "perSeriesAligner": "ALIGN_RATE",
            "crossSeriesReducer": "REDUCE_SUM",
            "groupByFields": ["resource.label.service_name", "metric.label.response_code_class"]
          }
        ],
        "comparison": "COMPARISON_GREATER_THAN",
        "thresholdValue": 0.05,
        "duration": "300s"
      }
    }
  ],
  "notificationChannels": ["${NOTIFICATION_CHANNEL}"],
  "alertStrategy": {
    "autoClose": "1800s"
  }
}
EOF
)

create_alert_policy "CPAAutomation - High Error Rate" "$HIGH_ERROR_RATE_POLICY"

# 2. High Latency Alert
echo -e "${YELLOW}Creating High Latency alert...${NC}"
HIGH_LATENCY_POLICY=$(cat <<EOF
{
  "displayName": "CPAAutomation - High Latency",
  "documentation": {
    "content": "Alert when 95th percentile latency exceeds 5 seconds"
  },
  "conditions": [
    {
      "displayName": "High latency condition",
      "conditionThreshold": {
        "filter": "resource.type=\"cloud_run_revision\" AND resource.label.service_name=~\"cpa-.*\" AND metric.type=\"run.googleapis.com/request_latencies\"",
        "aggregations": [
          {
            "alignmentPeriod": "300s",
            "perSeriesAligner": "ALIGN_DELTA",
            "crossSeriesReducer": "REDUCE_PERCENTILE_95",
            "groupByFields": ["resource.label.service_name"]
          }
        ],
        "comparison": "COMPARISON_GREATER_THAN",
        "thresholdValue": 5000,
        "duration": "300s"
      }
    }
  ],
  "notificationChannels": ["${NOTIFICATION_CHANNEL}"],
  "alertStrategy": {
    "autoClose": "1800s"
  }
}
EOF
)

create_alert_policy "CPAAutomation - High Latency" "$HIGH_LATENCY_POLICY"

# 3. Database Connection Alert
echo -e "${YELLOW}Creating Database Connection alert...${NC}"
DB_CONNECTION_POLICY=$(cat <<EOF
{
  "displayName": "CPAAutomation - Database Connection Issues",
  "documentation": {
    "content": "Alert when Cloud SQL connection count is high or connections are failing"
  },
  "conditions": [
    {
      "displayName": "High database connections",
      "conditionThreshold": {
        "filter": "resource.type=\"cloudsql_database\" AND resource.label.database_id=\"${PROJECT_ID}:cpaautomation-db\" AND metric.type=\"cloudsql.googleapis.com/database/postgresql/num_backends\"",
        "aggregations": [
          {
            "alignmentPeriod": "300s",
            "perSeriesAligner": "ALIGN_MEAN",
            "crossSeriesReducer": "REDUCE_MEAN"
          }
        ],
        "comparison": "COMPARISON_GREATER_THAN",
        "thresholdValue": 80,
        "duration": "300s"
      }
    }
  ],
  "notificationChannels": ["${NOTIFICATION_CHANNEL}"],
  "alertStrategy": {
    "autoClose": "1800s"
  }
}
EOF
)

create_alert_policy "CPAAutomation - Database Connection Issues" "$DB_CONNECTION_POLICY"

# 4. Redis Memory Usage Alert
echo -e "${YELLOW}Creating Redis Memory Usage alert...${NC}"
REDIS_MEMORY_POLICY=$(cat <<EOF
{
  "displayName": "CPAAutomation - Redis High Memory Usage",
  "documentation": {
    "content": "Alert when Redis memory usage exceeds 80%"
  },
  "conditions": [
    {
      "displayName": "High Redis memory usage",
      "conditionThreshold": {
        "filter": "resource.type=\"redis_instance\" AND resource.label.instance_id=\"cpaautomation-redis\" AND metric.type=\"redis.googleapis.com/stats/memory/usage_ratio\"",
        "aggregations": [
          {
            "alignmentPeriod": "300s",
            "perSeriesAligner": "ALIGN_MEAN",
            "crossSeriesReducer": "REDUCE_MEAN"
          }
        ],
        "comparison": "COMPARISON_GREATER_THAN",
        "thresholdValue": 0.8,
        "duration": "300s"
      }
    }
  ],
  "notificationChannels": ["${NOTIFICATION_CHANNEL}"],
  "alertStrategy": {
    "autoClose": "1800s"
  }
}
EOF
)

create_alert_policy "CPAAutomation - Redis High Memory Usage" "$REDIS_MEMORY_POLICY"

# Create custom dashboard
echo -e "${BLUE}=== Creating Custom Dashboard ===${NC}"
echo -e "${YELLOW}📊 Creating CPAAutomation dashboard...${NC}"

DASHBOARD_CONFIG=$(cat <<EOF
{
  "displayName": "CPAAutomation Production Dashboard",
  "mosaicLayout": {
    "tiles": [
      {
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Cloud Run Request Rate",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND resource.label.service_name=~\"cpa-.*\" AND metric.type=\"run.googleapis.com/request_count\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_RATE",
                      "crossSeriesReducer": "REDUCE_SUM",
                      "groupByFields": ["resource.label.service_name"]
                    }
                  }
                }
              }
            ]
          }
        }
      },
      {
        "width": 6,
        "height": 4,
        "xPos": 6,
        "widget": {
          "title": "Cloud Run Error Rate",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND resource.label.service_name=~\"cpa-.*\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.label.response_code_class!=\"2xx\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_RATE",
                      "crossSeriesReducer": "REDUCE_SUM",
                      "groupByFields": ["resource.label.service_name"]
                    }
                  }
                }
              }
            ]
          }
        }
      },
      {
        "width": 6,
        "height": 4,
        "yPos": 4,
        "widget": {
          "title": "Database Connections",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloudsql_database\" AND metric.type=\"cloudsql.googleapis.com/database/postgresql/num_backends\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_MEAN"
                    }
                  }
                }
              }
            ]
          }
        }
      },
      {
        "width": 6,
        "height": 4,
        "xPos": 6,
        "yPos": 4,
        "widget": {
          "title": "Redis Memory Usage",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"redis_instance\" AND metric.type=\"redis.googleapis.com/stats/memory/usage_ratio\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_MEAN"
                    }
                  }
                }
              }
            ]
          }
        }
      }
    ]
  }
}
EOF
)

# Check if dashboard already exists
EXISTING_DASHBOARD=$(gcloud monitoring dashboards list --filter="displayName:'CPAAutomation Production Dashboard'" --format="value(name)" 2>/dev/null || echo "")

if [ -n "$EXISTING_DASHBOARD" ]; then
    echo -e "${GREEN}✅ Dashboard already exists${NC}"
else
    echo "$DASHBOARD_CONFIG" | gcloud monitoring dashboards create --config-from-file=-
    echo -e "${GREEN}✅ Dashboard created${NC}"
fi

# Set up log-based metrics
echo -e "${BLUE}=== Setting Up Log-Based Metrics ===${NC}"
echo -e "${YELLOW}📝 Creating log-based metrics...${NC}"

# Worker queue backlog metric
QUEUE_METRIC_CONFIG=$(cat <<EOF
{
  "name": "worker_queue_backlog",
  "description": "Number of jobs waiting in worker queues",
  "filter": "resource.type=\"cloud_run_revision\" AND jsonPayload.queue_name!=\"\" AND jsonPayload.queue_size!=\"\"",
  "metricDescriptor": {
    "metricKind": "GAUGE",
    "valueType": "INT64"
  },
  "valueExtractor": "EXTRACT(jsonPayload.queue_size)",
  "labelExtractors": {
    "queue_name": "EXTRACT(jsonPayload.queue_name)"
  }
}
EOF
)

if ! gcloud logging metrics describe worker_queue_backlog >/dev/null 2>&1; then
    echo "$QUEUE_METRIC_CONFIG" | gcloud logging metrics create worker_queue_backlog --config-from-file=-
    echo -e "${GREEN}✅ Created worker queue backlog metric${NC}"
else
    echo -e "${GREEN}✅ Worker queue backlog metric already exists${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Monitoring setup complete!${NC}"
echo ""
echo -e "${BLUE}📊 Monitoring Resources Created:${NC}"
echo -e "• Notification channel for ${NOTIFICATION_EMAIL}"
echo -e "• High error rate alert policy"
echo -e "• High latency alert policy"
echo -e "• Database connection alert policy"
echo -e "• Redis memory usage alert policy"
echo -e "• CPAAutomation production dashboard"
echo -e "• Worker queue backlog log-based metric"
echo ""
echo -e "${YELLOW}📝 Next steps:${NC}"
echo -e "1. Access your dashboard: https://console.cloud.google.com/monitoring/dashboards"
echo -e "2. Verify alert policies: https://console.cloud.google.com/monitoring/alerting/policies"
echo -e "3. Test notifications by triggering an alert"
echo -e "4. Customize thresholds based on your traffic patterns"
echo ""
echo -e "${BLUE}🔍 Useful monitoring commands:${NC}"
echo -e "• List dashboards: gcloud monitoring dashboards list"
echo -e "• List alert policies: gcloud alpha monitoring policies list"
echo -e "• List notification channels: gcloud alpha monitoring channels list"
echo -e "• View logs: gcloud logging read 'resource.type=\"cloud_run_revision\"' --limit=50"