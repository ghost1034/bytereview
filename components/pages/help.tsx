'use client'

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, BookOpen, MessageCircle, Video, FileText, Settings, CreditCard, Users, ChevronRight, HelpCircle } from "lucide-react";

export default function Help() {
  const [searchQuery, setSearchQuery] = useState("");

  const categories = [
    {
      icon: BookOpen,
      title: "Getting Started",
      description: "Learn the basics of CPAAutomation",
      articles: [
        "How to upload your first document",
        "Understanding extraction results",
        "Setting up custom columns",
        "Exporting data to Excel and Google Sheets"
      ]
    },
    {
      icon: Settings,
      title: "Advanced Features",
      description: "Master custom rules and automation",
      articles: [
        "Creating custom extraction prompts",
        "Setting up data validation rules",
        "Using multiple extraction templates",
        "Batch processing documents"
      ]
    },
    {
      icon: CreditCard,
      title: "Billing & Plans",
      description: "Account and subscription management",
      articles: [
        "Understanding page limits",
        "Upgrading your plan",
        "Managing team members",
        "Payment and billing questions"
      ]
    },
    {
      icon: Users,
      title: "Enterprise Features",
      description: "Team collaboration and integrations",
      articles: [
        "Setting up team workspaces",
        "Custom API integrations",
        "Enterprise security features",
        "Dedicated support access"
      ]
    }
  ];

  const popularArticles = [
    {
      title: "How to create custom extraction rules",
      category: "Advanced Features",
      readTime: "5 min read"
    },
    {
      title: "Supported document formats and file types",
      category: "Getting Started",
      readTime: "3 min read"
    },
    {
      title: "Troubleshooting extraction accuracy",
      category: "Advanced Features",
      readTime: "7 min read"
    },
    {
      title: "Understanding your monthly page limits",
      category: "Billing & Plans",
      readTime: "4 min read"
    },
    {
      title: "Data security and compliance",
      category: "Enterprise Features",
      readTime: "6 min read"
    }
  ];

  return (
    <div className="min-h-screen py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">Help Center</h1>
          <p className="text-xl text-gray-600 mb-8">
            Find answers to your questions about CPAAutomation
          </p>
          
          {/* Search Bar */}
          <div className="max-w-2xl mx-auto relative">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                type="text"
                placeholder="Search for help articles..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 pr-4 py-4 text-lg"
              />
            </div>
            <Button className="absolute right-2 top-1/2 transform -translate-y-1/2 lido-green hover:lido-green-dark text-white">
              Search
            </Button>
          </div>
        </div>

        {/* Quick Actions */}
        <section className="mb-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardContent className="p-6 text-center">
                <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Video className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Watch Demos</h3>
                <p className="text-gray-600">See CPAAutomation in action</p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardContent className="p-6 text-center">
                <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Contact Support</h3>
                <p className="text-gray-600">Get help from our expert team</p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardContent className="p-6 text-center">
                <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Documentation</h3>
                <p className="text-gray-600">API guides and technical docs</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Popular Articles */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Popular Articles</h2>
          <div className="space-y-4">
            {popularArticles.map((article, index) => (
              <Card key={index} className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">{article.title}</h3>
                      <div className="flex items-center space-x-3">
                        <Badge variant="secondary">{article.category}</Badge>
                        <span className="text-sm text-gray-500">{article.readTime}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Help Categories */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Browse by Category</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {categories.map((category, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-8">
                  <div className="flex items-start space-x-4 mb-6">
                    <div className="bg-gray-100 w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0">
                      <category.icon className="w-6 h-6 text-gray-600" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">{category.title}</h3>
                      <p className="text-gray-600">{category.description}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {category.articles.map((article, articleIndex) => (
                      <div key={articleIndex} className="flex items-center space-x-3 text-gray-700 hover:text-blue-600 cursor-pointer transition-colors">
                        <HelpCircle className="w-4 h-4 flex-shrink-0" />
                        <span>{article}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Contact Section */}
        <section className="text-center bg-gray-50 rounded-lg p-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Still need help?</h2>
          <p className="text-lg text-gray-600 mb-6">
            Our support team is here to help with any questions about CPAAutomation
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button className="lido-green hover:lido-green-dark text-white">
              Contact Support
            </Button>
            <Button variant="outline">
              Schedule a Demo
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}