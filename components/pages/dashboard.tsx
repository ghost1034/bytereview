'use client'

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CloudUpload, Play, FileText, Receipt, CreditCard, Check, Loader2, Download, FileSpreadsheet, Plus, Trash2, User, Save, Settings, X, Edit, Copy, Star, Zap } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import SubscriptionManager from "@/components/SubscriptionManager";

interface ColumnConfig {
  id: string;
  customName: string;
  dataFormat: string;
  prompt: string;
}

interface Template {
  id: string;
  name: string;
  description: string;
  columns: ColumnConfig[];
  createdAt: string;
  lastUsed?: string;
  isPublic: boolean;
  usageCount: number;
}

const dataFormats = [
  "Text", "Number", "Currency", "Date (MM/DD/YYYY)", "Date (DD/MM/YYYY)", 
  "Date (YYYY-MM-DD)", "Percentage", "Email", "Phone Number", "Boolean (Yes/No)",
  "Address", "Name", "Invoice Number", "Tax ID", "SKU/Product Code", 
  "Decimal (2 places)", "Integer", "Time (HH:MM)", "URL"
];

export default function Dashboard() {
  const { user } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("custom");
  const [extractMultipleRows, setExtractMultipleRows] = useState(false);
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>([
    { id: "1", customName: "Invoice Number", dataFormat: "Invoice Number", prompt: "Extract the invoice or reference number from the document" },
    { id: "2", customName: "Date", dataFormat: "Date (MM/DD/YYYY)", prompt: "Find the invoice date or transaction date" },
    { id: "3", customName: "Total Amount", dataFormat: "Currency", prompt: "Extract the total amount due or invoice total" }
  ]);

  // Subscription data state
  const [subscriptionData, setSubscriptionData] = useState({
    plan: "Free",
    pagesUsed: 3,
    pagesLimit: 10,
    nextBilling: "Upgrade to increase limit",
    status: "active"
  });

  // Fetch user subscription data on component mount
  useEffect(() => {
    if (!user) {
      setSubscriptionData({
        plan: "No Plan",
        pagesUsed: 0,
        pagesLimit: 0,
        nextBilling: "N/A",
        status: "inactive"
      });
      return;
    }

    // Fetch real subscription data from API
    const checkSubscription = async () => {
      try {
        const response = await fetch('/api/subscription-status');
        if (response.ok) {
          const data = await response.json();
          setSubscriptionData(data);
        } else {
          // Fallback to free plan if API fails
          setSubscriptionData({
            plan: "Free",
            pagesUsed: 3,
            pagesLimit: 10,
            nextBilling: "Upgrade to increase limit",
            status: "active"
          });
        }
      } catch (error) {
        console.error('Error checking subscription:', error);
        // Fallback to free plan if API fails
        setSubscriptionData({
          plan: "Free",
          pagesUsed: 3,
          pagesLimit: 10,
          nextBilling: "Upgrade to increase limit",
          status: "active"
        });
      }
    };

    checkSubscription();
  }, [user]);

  const userSubscription = subscriptionData;

  // Mock saved templates
  const [savedTemplates, setSavedTemplates] = useState<Template[]>([
    {
      id: "1",
      name: "Invoice Processing",
      description: "Standard invoice data extraction",
      columns: [
        { id: "1", customName: "Invoice Number", dataFormat: "Invoice Number", prompt: "Extract the invoice or reference number" },
        { id: "2", customName: "Date", dataFormat: "Date (MM/DD/YYYY)", prompt: "Find the invoice date" },
        { id: "3", customName: "Total Amount", dataFormat: "Currency", prompt: "Extract the total amount" },
        { id: "4", customName: "Vendor Name", dataFormat: "Text", prompt: "Find the vendor or supplier name" }
      ],
      createdAt: "2024-01-10",
      lastUsed: "2024-01-20",
      isPublic: false,
      usageCount: 15
    },
    {
      id: "2", 
      name: "Receipt Scanner",
      description: "Retail receipt data extraction",
      columns: [
        { id: "1", customName: "Store Name", dataFormat: "Text", prompt: "Extract the store or merchant name" },
        { id: "2", customName: "Date", dataFormat: "Date (MM/DD/YYYY)", prompt: "Find the purchase date" },
        { id: "3", customName: "Total", dataFormat: "Currency", prompt: "Extract the total amount" },
        { id: "4", customName: "Tax Amount", dataFormat: "Currency", prompt: "Find the tax amount if present" }
      ],
      createdAt: "2024-01-08",
      lastUsed: "2024-01-18",
      isPublic: true,
      usageCount: 8
    }
  ]);

  const handleExtract = () => {
    setIsProcessing(true);
    setProgress(0);
    
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsProcessing(false);
          setShowResults(true);
          return 100;
        }
        return prev + 25;
      });
    }, 1000);
  };

  const saveTemplate = () => {
    if (!templateName.trim()) return;
    
    const newTemplate: Template = {
      id: Date.now().toString(),
      name: templateName,
      description: `Custom template with ${columnConfigs.length} columns`,
      columns: [...columnConfigs],
      createdAt: new Date().toISOString().split('T')[0],
      isPublic: false,
      usageCount: 0
    };
    
    setSavedTemplates(prev => [newTemplate, ...prev]);
    setTemplateName("");
  };

  const loadTemplate = (template: Template) => {
    setColumnConfigs(template.columns);
    setSelectedTemplate(template.id);
  };

  const deleteTemplate = (templateId: string) => {
    setSavedTemplates(prev => prev.filter(t => t.id !== templateId));
  };

  const addNewColumn = () => {
    const newId = (columnConfigs.length + 1).toString();
    setColumnConfigs([...columnConfigs, {
      id: newId,
      customName: "",
      dataFormat: "Text",
      prompt: ""
    }]);
  };

  const removeColumn = (id: string) => {
    if (columnConfigs.length > 1) {
      setColumnConfigs(columnConfigs.filter(col => col.id !== id));
    }
  };

  const updateColumn = (id: string, field: keyof ColumnConfig, value: string) => {
    setColumnConfigs(columnConfigs.map(col => 
      col.id === id ? { ...col, [field]: value } : col
    ));
  };

  // Check if user is approaching limit
  const isApproachingLimit = userSubscription.pagesUsed / userSubscription.pagesLimit > 0.8;
  const isOverLimit = userSubscription.pagesUsed >= userSubscription.pagesLimit;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Upgrade Banner for Free Users */}
        {userSubscription.plan === "Free" && (isApproachingLimit || isOverLimit) && (
          <div className="mb-6">
            <Card className="border-orange-200 bg-gradient-to-r from-orange-50 to-yellow-50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Zap className="w-6 h-6 text-orange-500" />
                    <div>
                      <h3 className="font-semibold text-orange-900">
                        {isOverLimit ? "Page limit reached!" : "Almost at your page limit"}
                      </h3>
                      <p className="text-sm text-orange-700">
                        {isOverLimit 
                          ? "Upgrade to continue extracting data from your PDFs"
                          : `You've used ${userSubscription.pagesUsed} of ${userSubscription.pagesLimit} free pages this month`
                        }
                      </p>
                    </div>
                  </div>
                  <Link href="/pricing">
                    <Button className="lido-green hover:lido-green-dark text-white">
                      Upgrade Now
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* User Profile Header */}
        <div className="mb-8">
          <Card className="bg-gradient-to-r from-blue-50 to-green-50 border-blue-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center">
                    <User className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.displayName || 'User'}!</h1>
                    <p className="text-gray-600">{user?.email}</p>
                    <div className="flex items-center space-x-3 mt-2">
                      <Badge variant="default" className="bg-green-500">{userSubscription.plan} Plan</Badge>
                      <Badge variant={userSubscription.status === 'active' ? 'default' : 'secondary'}>
                        {userSubscription.status === 'active' ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm text-gray-500">Pages Used This Month</p>
                      <div className="flex items-center space-x-2">
                        <Progress value={(userSubscription.pagesUsed / userSubscription.pagesLimit) * 100} className="w-32" />
                        <span className="text-sm font-medium">{userSubscription.pagesUsed}/{userSubscription.pagesLimit}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">Next billing: {userSubscription.nextBilling}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Dashboard Tabs */}
        <Tabs defaultValue="extract" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="extract">Extract Data</TabsTrigger>
            <TabsTrigger value="templates">Template Library</TabsTrigger>
            <TabsTrigger value="account">Account Settings</TabsTrigger>
          </TabsList>

          {/* Extract Data Tab */}
          <TabsContent value="extract" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Upload Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <CloudUpload className="w-5 h-5" />
                    <span>Upload Documents</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors cursor-pointer">
                    <CloudUpload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-lg font-medium text-gray-900 mb-2">Drop files here or click to upload</p>
                    <p className="text-sm text-gray-500">Supports PDF, PNG, JPG files up to 10MB</p>
                  </div>
                  
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-gray-900">Uploaded Files:</h4>
                      {uploadedFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span className="text-sm">{file}</span>
                          <Button variant="ghost" size="sm">
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Template Selection */}
              <Card>
                <CardHeader>
                  <CardTitle>Template Selection</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Choose Template</label>
                    <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a template" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom">Custom Configuration</SelectItem>
                        {savedTemplates.map(template => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-gray-900">Save as Template</h4>
                    </div>
                    <div className="flex space-x-2">
                      <Input
                        placeholder="Template name..."
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        className="flex-1"
                      />
                      <Button onClick={saveTemplate} disabled={!templateName.trim()}>
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Column Configuration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Column Configuration</span>
                  <Button onClick={addNewColumn} variant="outline" size="sm">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Column
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {columnConfigs.map((column, index) => (
                    <div key={column.id} className="p-4 border border-gray-200 rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-gray-900">Column {index + 1}</h4>
                        {columnConfigs.length > 1 && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => removeColumn(column.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Column Name</label>
                          <Input
                            value={column.customName}
                            onChange={(e) => updateColumn(column.id, 'customName', e.target.value)}
                            placeholder="e.g., Invoice Number"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Data Format</label>
                          <Select value={column.dataFormat} onValueChange={(value) => updateColumn(column.id, 'dataFormat', value)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {dataFormats.map(format => (
                                <SelectItem key={format} value={format}>{format}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Extraction Prompt</label>
                        <Textarea
                          value={column.prompt}
                          onChange={(e) => updateColumn(column.id, 'prompt', e.target.value)}
                          placeholder="Describe what data to extract for this column..."
                          rows={2}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Extract Multiple Rows Checkbox */}
                <div className="mt-6 flex items-center space-x-2">
                  <Checkbox 
                    id="extractMultipleRows"
                    checked={extractMultipleRows}
                    onCheckedChange={(checked) => setExtractMultipleRows(checked === true)}
                  />
                  <label 
                    htmlFor="extractMultipleRows" 
                    className="text-sm font-medium text-gray-700 cursor-pointer"
                  >
                    Extract Multiple Rows per Document
                  </label>
                </div>

                <div className="mt-6 flex justify-center">
                  <Button 
                    onClick={handleExtract} 
                    disabled={isProcessing || uploadedFiles.length === 0}
                    className="lido-green hover:lido-green-dark text-white px-8"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="animate-spin w-4 h-4 mr-2" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Extract Data
                      </>
                    )}
                  </Button>
                </div>

                {isProcessing && (
                  <div className="mt-4">
                    <Progress value={progress} className="w-full" />
                    <p className="text-center mt-2 text-sm text-gray-600">Processing documents... {progress}%</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Results Section */}
            {showResults && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Extraction Results</span>
                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm">
                        <Download className="w-4 h-4 mr-2" />
                        Export CSV
                      </Button>
                      <Button variant="outline" size="sm">
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                        Export Excel
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full border border-gray-200 rounded-lg">
                      <thead className="bg-gray-50">
                        <tr>
                          {columnConfigs.map(column => (
                            <th key={column.id} className="px-4 py-2 text-left font-medium text-gray-900">
                              {column.customName}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t">
                          <td className="px-4 py-2">INV-2024-001</td>
                          <td className="px-4 py-2">01/15/2024</td>
                          <td className="px-4 py-2">$1,250.00</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Template Library Tab */}
          <TabsContent value="templates" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>My Template Library</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {savedTemplates.map(template => (
                    <Card key={template.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-semibold text-gray-900 mb-1">{template.name}</h3>
                            <p className="text-sm text-gray-600">{template.description}</p>
                          </div>
                          <div className="flex items-center space-x-1">
                            {template.isPublic && <Star className="w-4 h-4 text-yellow-500" />}
                            <Button variant="ghost" size="sm" onClick={() => deleteTemplate(template.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                        
                        <div className="space-y-2 text-xs text-gray-500 mb-3">
                          <p>Columns: {template.columns.length}</p>
                          <p>Created: {template.createdAt}</p>
                          <p>Used: {template.usageCount} times</p>
                        </div>
                        
                        <div className="flex space-x-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1"
                            onClick={() => loadTemplate(template)}
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Use
                          </Button>
                          <Button variant="outline" size="sm">
                            <Copy className="w-4 h-4 mr-1" />
                            Copy
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Account Settings Tab */}
          <TabsContent value="account" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SubscriptionManager />

              <Card>
                <CardHeader>
                  <CardTitle>Usage Statistics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-gray-700">Pages Used</span>
                      <span className="text-gray-900">{userSubscription.pagesUsed}/{userSubscription.pagesLimit}</span>
                    </div>
                    <Progress value={(userSubscription.pagesUsed / userSubscription.pagesLimit) * 100} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Templates Created</span>
                    <span className="text-gray-900">{savedTemplates.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">Total Extractions</span>
                    <span className="text-gray-900">42</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}