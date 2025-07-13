'use client'

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CloudUpload, Play, FileText, Receipt, CreditCard, Check, Loader2, Download, FileSpreadsheet, Plus, Trash2, User, Save, Settings, X } from "lucide-react";

interface ColumnConfig {
  id: string;
  customName: string;
  dataFormat: string;
  prompt: string;
}

const dataFormats = [
  "Text",
  "Number", 
  "Currency",
  "Date (MM/DD/YYYY)",
  "Date (DD/MM/YYYY)",
  "Date (YYYY-MM-DD)",
  "Percentage",
  "Email",
  "Phone Number",
  "Boolean (Yes/No)",
  "Address",
  "Name",
  "Invoice Number",
  "Tax ID",
  "SKU/Product Code",
  "Decimal (2 places)",
  "Integer",
  "Time (HH:MM)",
  "URL"
];

export default function Demo() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [extractMultipleRows, setExtractMultipleRows] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("custom");
  const [userProfile, setUserProfile] = useState({
    name: "John Smith",
    company: "Acme Corporation",
    subscription: "Professional"
  });
  const [savedTemplates, setSavedTemplates] = useState([
    {
      id: "1",
      name: "Invoice Processing",
      description: "Standard invoice data extraction",
      columns: [
        { id: "1", customName: "Invoice Number", dataFormat: "Invoice Number", prompt: "Extract the invoice or reference number" },
        { id: "2", customName: "Date", dataFormat: "Date (MM/DD/YYYY)", prompt: "Find the invoice date" },
        { id: "3", customName: "Total Amount", dataFormat: "Currency", prompt: "Extract the total amount due" },
        { id: "4", customName: "Vendor Name", dataFormat: "Text", prompt: "Extract the vendor or supplier name" }
      ]
    },
    {
      id: "2", 
      name: "Bank Statement Analysis",
      description: "Extract transaction data from bank statements",
      columns: [
        { id: "1", customName: "Date", dataFormat: "Date (MM/DD/YYYY)", prompt: "Transaction date" },
        { id: "2", customName: "Description", dataFormat: "Text", prompt: "Transaction description" },
        { id: "3", customName: "Amount", dataFormat: "Currency", prompt: "Transaction amount" },
        { id: "4", customName: "Balance", dataFormat: "Currency", prompt: "Account balance after transaction" }
      ]
    },
    {
      id: "3",
      name: "Receipt Processing", 
      description: "Extract key data from receipts and expense reports",
      columns: [
        { id: "1", customName: "Merchant", dataFormat: "Text", prompt: "Store or merchant name" },
        { id: "2", customName: "Date", dataFormat: "Date (MM/DD/YYYY)", prompt: "Purchase date" },
        { id: "3", customName: "Total", dataFormat: "Currency", prompt: "Total amount paid" },
        { id: "4", customName: "Category", dataFormat: "Text", prompt: "Expense category (meals, office supplies, etc.)" }
      ]
    },
    {
      id: "4",
      name: "Tax Document Extraction",
      description: "Extract data from tax forms and documents", 
      columns: [
        { id: "1", customName: "Tax Year", dataFormat: "Number", prompt: "Tax year from the document" },
        { id: "2", customName: "Taxpayer Name", dataFormat: "Name", prompt: "Name of taxpayer" },
        { id: "3", customName: "SSN/EIN", dataFormat: "Tax ID", prompt: "Social Security Number or EIN" },
        { id: "4", customName: "Income Amount", dataFormat: "Currency", prompt: "Total income amount" }
      ]
    }
  ]);
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>([
    { id: "1", customName: "Invoice Number", dataFormat: "Invoice Number", prompt: "Extract the invoice or reference number from the document" },
    { id: "2", customName: "Date", dataFormat: "Date (MM/DD/YYYY)", prompt: "Find the invoice date or transaction date" },
    { id: "3", customName: "Total Amount", dataFormat: "Currency", prompt: "Extract the total amount due or invoice total" }
  ]);

  useEffect(() => {
    // Check for authentication status and uploaded files
    const urlParams = new URLSearchParams(window.location.search);
    const authenticated = urlParams.get('authenticated') === 'true';
    setIsAuthenticated(authenticated);

    // Check for uploaded files from sessionStorage
    const storedFiles = sessionStorage.getItem('uploadedFiles');
    if (storedFiles) {
      setUploadedFiles(JSON.parse(storedFiles));
      sessionStorage.removeItem('uploadedFiles');
    }
  }, []);

  const handleExtract = () => {
    setIsProcessing(true);
    setProgress(0);
    
    // Simulate processing
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

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>, id: string, field: keyof ColumnConfig) => {
    if (e.key === 'Enter') {
      updateColumn(id, field, e.currentTarget.value);
      e.currentTarget.blur();
    }
  };

  const saveTemplate = () => {
    if (!templateName.trim()) {
      // Note: This is demo code, but we'll use console.log instead of alert
      console.log("Please enter a template name");
      return;
    }
    // Simulate saving template
    // Note: This is demo code, but we'll use console.log instead of alert
    console.log(`Template "${templateName}" saved successfully!`);
    setTemplateName("");
  };

  const loadTemplate = (templateId: string) => {
    if (templateId === "custom") {
      setSelectedTemplate("custom");
      return;
    }
    
    const template = savedTemplates.find(t => t.id === templateId);
    if (template) {
      setColumnConfigs(template.columns);
      setSelectedTemplate(templateId);
    }
  };

  const deleteTemplate = (templateId: string) => {
    if (confirm("Are you sure you want to delete this template?")) {
      setSavedTemplates(prev => prev.filter(t => t.id !== templateId));
      if (selectedTemplate === templateId) {
        setSelectedTemplate("custom");
      }
    }
  };

  const updateProfile = (field: string, value: string) => {
    setUserProfile(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="min-h-screen py-20">
      {/* Video Demo Section */}
      <section className="bg-white py-16 mb-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">See Financial Extract in Action</h1>
          <p className="text-xl text-gray-600 mb-8">Watch how our AI extracts data from financial documents with professional accuracy</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            {/* Video Placeholder 1 */}
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="relative bg-gray-100 aspect-video flex items-center justify-center">
                  <div className="text-center">
                    <Play className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 font-medium">Invoice Processing Demo</p>
                    <p className="text-sm text-gray-500">Video placeholder - Add video link here</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Video Placeholder 2 */}
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="relative bg-gray-100 aspect-video flex items-center justify-center">
                  <div className="text-center">
                    <Play className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 font-medium">Custom Rules Setup</p>
                    <p className="text-sm text-gray-500">Video placeholder - Add video link here</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* User Profile Section - Only for authenticated users */}
        {isAuthenticated && (
          <Card className="mb-8 border-green-200 bg-green-50">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-4">
                  <div className="bg-green-500 text-white w-12 h-12 rounded-full flex items-center justify-center">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Welcome back, {userProfile.name}!</h3>
                    <p className="text-gray-600">{userProfile.company}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <Badge variant="secondary">{userProfile.subscription} Plan</Badge>
                      <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-800">
                        <Settings className="w-4 h-4 mr-1" />
                        Manage Subscription
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Input
                    placeholder="Update name"
                    value={userProfile.name}
                    onChange={(e) => updateProfile('name', e.target.value)}
                    className="w-48"
                  />
                  <Input
                    placeholder="Update company"
                    value={userProfile.company}
                    onChange={(e) => updateProfile('company', e.target.value)}
                    className="w-48"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            {isAuthenticated ? "FinancialExtract Dashboard" : "Try FinancialExtract for Free"}
          </h1>
          <p className="text-xl text-gray-600">
            {isAuthenticated 
              ? "Manage your document extraction projects and templates" 
              : "Upload your own PDFs and see how FinancialExtract works with your documents."
            }
          </p>
          
          {!isAuthenticated && (
            <div className="flex items-center justify-center space-x-4 mt-6">
              <Button className="bg-blue-500 text-white hover:bg-blue-600 flex items-center space-x-2">
                <Play className="w-4 h-4" />
                <span>Watch demo (3 mins)</span>
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Upload Section */}
          <div className="space-y-6">
            {/* Show uploaded files if any */}
            {uploadedFiles.length > 0 && (
              <Card className="border-blue-200 bg-blue-50">
                <CardContent className="p-6">
                  <h4 className="font-semibold text-gray-900 mb-3">Uploaded Files</h4>
                  <div className="space-y-2">
                    {uploadedFiles.map((fileName, index) => (
                      <div key={index} className="flex items-center space-x-2 text-sm">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <span className="text-gray-700">{fileName}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-2 border-dashed border-gray-300 hover:border-blue-500 transition-colors">
              <CardContent className="p-12 text-center">
                <CloudUpload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Upload File</h3>
                <p className="text-gray-600 mb-4">Click to upload or drag and drop your PDF files here</p>
                <Button className="lido-blue hover:lido-blue-dark text-white">
                  Choose Files
                </Button>
                <div className="mt-4 text-sm text-gray-500">
                  Supported formats: PDF, JPEG, PNG • Max file size: 10MB
                </div>
              </CardContent>
            </Card>

            {/* Sample Documents */}
            <Card className="bg-gray-50">
              <CardContent className="p-6">
                <h4 className="font-semibold text-gray-900 mb-4">Try with sample documents:</h4>
                <div className="space-y-2">
                  <Button variant="outline" className="w-full justify-start space-x-3">
                    <FileText className="text-red-500 w-4 h-4" />
                    <span>Sample Invoice.pdf</span>
                  </Button>
                  <Button variant="outline" className="w-full justify-start space-x-3">
                    <CreditCard className="text-blue-500 w-4 h-4" />
                    <span>Bank Statement.pdf</span>
                  </Button>
                  <Button variant="outline" className="w-full justify-start space-x-3">
                    <Receipt className="text-blue-500 w-4 h-4" />
                    <span>Receipt.pdf</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Configuration Section */}
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Extract</h3>
                
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-medium text-gray-900">Column Configuration</h4>
                    {isAuthenticated && (
                      <Select value={selectedTemplate} onValueChange={loadTemplate}>
                        <SelectTrigger className="w-64">
                          <SelectValue placeholder="Load existing template" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="custom">Custom Configuration</SelectItem>
                          {savedTemplates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-4">Configure the data points you want to extract from your documents</p>
                  
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-200">
                      <div className="grid grid-cols-12 gap-4 p-3 text-sm font-medium text-gray-700">
                        <div className="col-span-4">Custom Column Names</div>
                        <div className="col-span-3">Data Format</div>
                        <div className="col-span-4">Column Prompts</div>
                        <div className="col-span-1"></div>
                      </div>
                    </div>
                    
                    <div className="divide-y divide-gray-200">
                      {columnConfigs.map((config) => (
                        <div key={config.id} className="grid grid-cols-12 gap-4 p-3 items-center">
                          <div className="col-span-4">
                            <Input
                              value={config.customName}
                              placeholder="Enter column name"
                              onChange={(e) => updateColumn(config.id, 'customName', e.target.value)}
                              onKeyPress={(e) => handleKeyPress(e, config.id, 'customName')}
                              className="w-full"
                            />
                          </div>
                          <div className="col-span-3">
                            <Select
                              value={config.dataFormat}
                              onValueChange={(value) => updateColumn(config.id, 'dataFormat', value)}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select format" />
                              </SelectTrigger>
                              <SelectContent>
                                {dataFormats.map((format) => (
                                  <SelectItem key={format} value={format}>
                                    {format}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-4">
                            <Input
                              value={config.prompt}
                              placeholder="Describe what to extract"
                              onChange={(e) => updateColumn(config.id, 'prompt', e.target.value)}
                              onKeyPress={(e) => handleKeyPress(e, config.id, 'prompt')}
                              className="w-full"
                            />
                          </div>
                          <div className="col-span-1">
                            {columnConfigs.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeColumn(config.id)}
                                className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="border-t border-gray-200 p-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={addNewColumn}
                        className="flex items-center space-x-2 text-blue-600 border-blue-600 hover:bg-blue-50"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add Column</span>
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="multipleRows" 
                      checked={extractMultipleRows}
                      onCheckedChange={(checked) => setExtractMultipleRows(checked === true)}
                    />
                    <label htmlFor="multipleRows" className="text-sm text-gray-700">
                      Extract Multiple Rows per Document
                    </label>
                  </div>
                </div>

                {/* Template Saving Section - Only for authenticated users */}
                {isAuthenticated && (
                  <div className="mb-6 border-t border-gray-200 pt-6">
                    <h4 className="font-medium text-gray-900 mb-3">Save Template</h4>
                    <p className="text-sm text-gray-600 mb-3">Save this column configuration as a reusable template</p>
                    <div className="flex space-x-2">
                      <Input
                        placeholder="Enter template name"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        onClick={saveTemplate}
                        className="lido-blue hover:lido-blue-dark text-white flex items-center space-x-2"
                      >
                        <Save className="w-4 h-4" />
                        <span>Save Template</span>
                      </Button>
                    </div>
                  </div>
                )}

                <Button 
                  onClick={handleExtract}
                  disabled={isProcessing}
                  className="w-full lido-blue hover:lido-blue-dark text-white"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    "Extract Data"
                  )}
                </Button>

                <div className="mt-4 text-center text-sm text-gray-500">Convert your first 10 PDF pages free</div>
              </CardContent>
            </Card>

            {/* Processing Status */}
            <Card>
              <CardContent className="p-6">
                <h4 className="font-medium text-gray-900 mb-3">Processing Status</h4>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                      <Check className="text-white w-3 h-3" />
                    </div>
                    <span className="text-gray-700">File uploaded successfully</span>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      progress >= 25 ? 'bg-blue-500' : 'bg-yellow-400'
                    }`}>
                      {progress >= 25 ? (
                        <Check className="text-white w-3 h-3" />
                      ) : (
                        <Loader2 className="text-white w-3 h-3 animate-spin" />
                      )}
                    </div>
                    <span className="text-gray-700">Analyzing document...</span>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      progress >= 75 ? 'bg-blue-500' : progress >= 25 ? 'bg-yellow-400' : 'bg-gray-300'
                    }`}>
                      {progress >= 75 ? (
                        <Check className="text-white w-3 h-3" />
                      ) : progress >= 25 ? (
                        <Loader2 className="text-white w-3 h-3 animate-spin" />
                      ) : null}
                    </div>
                    <span className={progress >= 25 ? 'text-gray-700' : 'text-gray-400'}>Extracting data</span>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      progress >= 100 ? 'bg-blue-500' : 'bg-gray-300'
                    }`}>
                      {progress >= 100 && <Check className="text-white w-3 h-3" />}
                    </div>
                    <span className={progress >= 100 ? 'text-gray-700' : 'text-gray-400'}>Ready for download</span>
                  </div>
                  
                  {progress > 0 && progress < 100 && (
                    <div className="mt-4">
                      <Progress value={progress} className="w-full" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Results Preview */}
        {showResults && (
          <div className="mt-12">
            <Card>
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Extracted Data Preview</h3>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-blue-100">
                    <tr>
                      {columnConfigs.map((config) => (
                        <th key={config.id} className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                          {config.customName || 'Unnamed Column'}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    <tr>
                      {columnConfigs.map((config) => (
                        <td key={`row1-${config.id}`} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {config.customName === 'Invoice Number' ? 'INV-2024-001' :
                           config.customName === 'Date' ? '01/15/2024' :
                           config.customName === 'Total Amount' ? '$1,250.00' :
                           config.dataFormat === 'Currency' ? '$1,250.00' :
                           config.dataFormat === 'Date (MM/DD/YYYY)' ? '01/15/2024' :
                           config.dataFormat === 'Invoice Number' ? 'INV-2024-001' :
                           config.dataFormat === 'Number' ? '1250' :
                           config.dataFormat === 'Text' ? 'Sample Data' :
                           'Sample'}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      {columnConfigs.map((config) => (
                        <td key={`row2-${config.id}`} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {config.customName === 'Invoice Number' ? 'INV-2024-002' :
                           config.customName === 'Date' ? '01/16/2024' :
                           config.customName === 'Total Amount' ? '$875.50' :
                           config.dataFormat === 'Currency' ? '$875.50' :
                           config.dataFormat === 'Date (MM/DD/YYYY)' ? '01/16/2024' :
                           config.dataFormat === 'Invoice Number' ? 'INV-2024-002' :
                           config.dataFormat === 'Number' ? '875' :
                           config.dataFormat === 'Text' ? 'Sample Data' :
                           'Sample'}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-between items-center">
                <span className="text-sm text-gray-600">2 rows extracted</span>
                <div className="space-x-2">
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Download CSV
                  </Button>
                  <Button className="lido-blue hover:lido-blue-dark text-white" size="sm">
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Export to Excel
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Template Library Section - Only for authenticated users */}
        {isAuthenticated && (
          <div className="mt-16 border-t border-gray-200 pt-16">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Template Library</h2>
              <p className="text-xl text-gray-600">Choose from pre-built templates or create your own custom configurations</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {savedTemplates.map((template) => (
                <Card key={template.id} className="hover:shadow-lg transition-shadow border-gray-200 relative">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="text-xs">
                          {template.columns.length} fields
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteTemplate(template.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 h-auto"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-4">{template.description}</p>
                    
                    <div className="space-y-2 mb-4">
                      <h4 className="text-xs font-medium text-gray-700 uppercase tracking-wider">Fields:</h4>
                      {template.columns.slice(0, 3).map((column) => (
                        <div key={column.id} className="flex items-center space-x-2 text-xs">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          <span className="text-gray-600">{column.customName}</span>
                          <span className="text-gray-400">({column.dataFormat})</span>
                        </div>
                      ))}
                      {template.columns.length > 3 && (
                        <div className="text-xs text-gray-400">
                          +{template.columns.length - 3} more fields
                        </div>
                      )}
                    </div>
                    
                    <Button 
                      onClick={() => loadTemplate(template.id)}
                      className="w-full lido-blue hover:lido-blue-dark text-white"
                      size="sm"
                    >
                      Use Template
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
