'use client'

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, CloudUpload, Database, Table, Bot, Shield, ShieldX, Lock, Ban, Star, FileText, Grid3X3, Settings, MapPinCheck, DollarSign, Scale, TrendingUp, Building2, ShieldCheck, House } from "lucide-react";
import { FaGoogle, FaMicrosoft, FaFileExcel } from "react-icons/fa";

export default function Home() {
  const router = useRouter();
  const [isDragOver, setIsDragOver] = useState(false);
  const { user } = useAuth();

  const handleGetStarted = () => {
    // Redirect based on authentication status
    if (user) {
      router.push("/dashboard");
    } else {
      router.push("/demo");
    }
  };

  const handleFileUpload = (files: FileList | null) => {
    if (files && files.length > 0) {
      // Store files in sessionStorage for demo purposes
      const fileNames = Array.from(files).map(file => file.name);
      sessionStorage.setItem('uploadedFiles', JSON.stringify(fileNames));
      router.push("/demo");
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white min-h-[calc(100vh-var(--header-height))] flex items-center py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div>
              <h1 className="text-5xl font-bold text-white mb-2">
                True GenAI Customizable Extraction
              </h1>
              <p className="text-lg text-gray-300 mb-8">
                Engineered by real CPAs for practical professional use
              </p>
              <p className="text-xl text-gray-200 mb-8">
                Professional-grade AI extraction built with deep accounting and legal expertise.
              </p>
              
              <div className="space-y-4 mb-8 flex flex-col items-center">
                <div className="flex items-center space-x-3">
                  <Check className="text-green-500 w-5 h-5" />
                  <span className="text-gray-200">CPA-designed extraction rules for financial compliance</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Check className="text-green-500 w-5 h-5" />
                  <span className="text-gray-200">Lawyer-validated data processing for legal requirements</span>
                </div>
                <div className="flex items-center space-x-3">
                  <Check className="text-green-500 w-5 h-5" />
                  <span className="text-gray-200">Custom workflows for enterprise-grade automation</span>
                </div>
              </div>

              {/* Investment Statement Example */}
              <div className="mb-8 flex justify-center">
                <Card className="shadow-lg max-w-2xl">
                  <CardContent className="p-4">
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center space-x-2">
                        <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                        <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                        <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                        <span className="text-sm text-gray-600 ml-2">Investment Statement Extraction</span>
                      </div>
                      <div className="p-3">
                        <div className="grid grid-cols-6 gap-1 text-xs">
                          <div className="bg-blue-100 p-2 rounded text-center font-medium truncate">Portfolio Co.</div>
                          <div className="bg-blue-100 p-2 rounded text-center font-medium truncate">Quarter</div>
                          <div className="bg-blue-100 p-2 rounded text-center font-medium truncate">Revenue</div>
                          <div className="bg-blue-100 p-2 rounded text-center font-medium truncate">EBITDA</div>
                          <div className="bg-blue-100 p-2 rounded text-center font-medium truncate">Growth %</div>
                          <div className="bg-blue-100 p-2 rounded text-center font-medium truncate">Valuation</div>
                          <div className="p-2 text-center truncate">TechFlow Inc</div>
                          <div className="p-2 text-center truncate">Q4 2024</div>
                          <div className="p-2 text-center truncate">$12.5M</div>
                          <div className="p-2 text-center truncate">$3.2M</div>
                          <div className="p-2 text-center truncate">23%</div>
                          <div className="p-2 text-center truncate">$85M</div>
                          <div className="p-2 text-center truncate">DataMind Corp</div>
                          <div className="p-2 text-center truncate">Q4 2024</div>
                          <div className="p-2 text-center truncate">$8.7M</div>
                          <div className="p-2 text-center truncate">$1.9M</div>
                          <div className="p-2 text-center truncate">31%</div>
                          <div className="p-2 text-center truncate">$62M</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              <div className="space-y-4 flex flex-col items-center">
                <div className="flex items-center space-x-2 max-w-md">
                  <Button 
                    onClick={handleGetStarted}
                    className="bg-white text-gray-900 hover:bg-gray-100 px-6 w-full"
                  >
                    Get started for free →
                  </Button>
                </div>
                <div className="flex items-center space-x-4 text-sm text-gray-300">
                  <div className="flex items-center space-x-1">
                    <Check className="text-green-500 w-4 h-4" />
                    <span>No credit card required</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Check className="text-green-500 w-4 h-4" />
                    <span>100 free pages/month</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Everything you need to extract data from any file</h2>
            <p className="text-xl text-gray-600">No complex training required — just type in plain English.</p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
            <Link href="/features" className="block">
              <Card className="hover:shadow-xl transition-shadow cursor-pointer h-full flex flex-col">
                <CardContent className="p-8 flex-1 flex flex-col">
                  <div className="bg-blue-100 w-16 h-16 rounded-lg flex items-center justify-center mb-6">
                    <FileText className="text-blue-600 w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Data extractor</h3>
                  <p className="text-gray-600 mb-4 flex-1">Intelligently extract and structure key information from any document type with precision.</p>
                  <div className="space-y-2 text-sm text-gray-500 mt-auto">
                    <div>• Financial statements</div>
                    <div>• Contract documents</div>
                    <div>• Medical records</div>
                    <div>• Legal forms</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
            
            <Link href="/features" className="block">
              <Card className="hover:shadow-xl transition-shadow cursor-pointer h-full flex flex-col">
                <CardContent className="p-8 flex-1 flex flex-col">
                  <div className="bg-purple-100 w-16 h-16 rounded-lg flex items-center justify-center mb-6">
                    <Grid3X3 className="text-purple-600 w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Table extractor</h3>
                  <p className="text-gray-600 mb-4 flex-1">Advanced table recognition that captures complex layouts and preserves data relationships.</p>
                  <div className="space-y-2 text-sm text-gray-500 mt-auto">
                    <div>• Multi-page reports</div>
                    <div>• Complex spreadsheets</div>
                    <div>• Financial tables</div>
                    <div>• Data matrices</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
            
            <Link href="/features" className="block">
              <Card className="hover:shadow-xl transition-shadow cursor-pointer h-full flex flex-col">
                <CardContent className="p-8 flex-1 flex flex-col">
                  <div className="bg-orange-100 w-16 h-16 rounded-lg flex items-center justify-center mb-6">
                    <Settings className="text-orange-600 w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Custom extraction at will</h3>
                  <p className="text-gray-600 mb-4 flex-1">Create custom columns with self-defined formats and prompts. Classify data and add details like G/L codes.</p>
                  <div className="space-y-2 text-sm text-gray-500 mt-auto">
                    <div>• Custom data formats</div>
                    <div>• Classification rules</div>
                    <div>• Accounting codes</div>
                    <div>• Smart categorization</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </section>

      {/* Automation Section */}
      <section className="py-20 bg-blue-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Set It and Forget It Automation</h2>
            <p className="text-xl text-gray-600">Email attachments → AI extraction → Automated delivery. Zero manual work.</p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-16">
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-6">Email-Triggered Processing</h3>
              <div className="space-y-4">
                <div className="flex items-start space-x-4">
                  <div className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">1</div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Forward or send emails to document@cpaautomation.ai</h4>
                    <p className="text-gray-600">Any email with PDF attachments automatically triggers processing</p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <div className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">2</div>
                  <div>
                    <h4 className="font-semibold text-gray-900">AI extracts data using your templates</h4>
                    <p className="text-gray-600">Custom fields, prompts, and rules you've configured</p>
                  </div>
                </div>
                <div className="flex items-start space-x-4">
                  <div className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">3</div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Results auto-exported to Google Drive</h4>
                    <p className="text-gray-600">CSV and Excel files delivered exactly where you need them</p>
                  </div>
                </div>
              </div>
              
              <div className="mt-8 p-4 bg-white rounded-lg border border-blue-200">
                <p className="text-sm text-gray-600 mb-2"><strong>Popular automation filters:</strong></p>
                <div className="space-y-1 text-sm">
                  <code className="bg-gray-100 px-2 py-1 rounded">subject:invoice has:attachment</code><br/>
                  <code className="bg-gray-100 px-2 py-1 rounded">from:vendor@company.com filename:pdf</code><br/>
                  <code className="bg-gray-100 px-2 py-1 rounded">subject:"monthly report" has:attachment</code>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Bot className="text-blue-600 w-8 h-8" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Live Demo</h4>
                <p className="text-gray-600 text-sm mb-4">Send a sample invoice to document@cpaautomation.ai and watch it get processed in real-time</p>
                <Button onClick={handleGetStarted} className="lido-green hover:lido-green-dark text-white">
                  Try Automation Now →
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations & File Types Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Seamless Integrations & File Support</h2>
            <p className="text-xl text-gray-600">Works with your existing tools and handles any document format</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16">
            {/* Import Sources */}
            <Card>
              <CardContent className="p-8">
                <div className="bg-green-100 w-16 h-16 rounded-lg flex items-center justify-center mb-6">
                  <CloudUpload className="text-green-600 w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">Import From Anywhere</h3>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <FaGoogle className="text-blue-500 w-5 h-5" />
                    <span className="text-gray-700">Google Drive folders and files</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <CloudUpload className="text-gray-500 w-5 h-5" />
                    <span className="text-gray-700">Local file upload (single files, folders, ZIP)</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Bot className="text-purple-500 w-5 h-5" />
                    <span className="text-gray-700">Email attachments (automated)</span>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-4">Drag & drop, bulk upload, or automated import - your choice</p>
              </CardContent>
            </Card>

            {/* Export Destinations */}
            <Card>
              <CardContent className="p-8">
                <div className="bg-blue-100 w-16 h-16 rounded-lg flex items-center justify-center mb-6">
                  <Database className="text-blue-600 w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">Export Everywhere</h3>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <FaFileExcel className="text-green-500 w-5 h-5" />
                    <span className="text-gray-700">Excel (.xlsx) and CSV formats</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <FaGoogle className="text-blue-500 w-5 h-5" />
                    <span className="text-gray-700">Google Drive (automated delivery)</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <CloudUpload className="text-gray-500 w-5 h-5" />
                    <span className="text-gray-700">Direct download to your computer</span>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-4">Results delivered exactly where your team needs them</p>
              </CardContent>
            </Card>
          </div>

          {/* Supported File Types */}
          <div className="text-center">
            <h3 className="text-2xl font-bold text-gray-900 mb-8">Supports All Document Types</h3>
            <div className="flex flex-wrap justify-center gap-4 mb-8">
              <div className="bg-red-100 text-red-700 px-4 py-2 rounded-full font-medium">PDF</div>
              <div className="bg-blue-100 text-blue-700 px-4 py-2 rounded-full font-medium">DOCX</div>
              <div className="bg-green-100 text-green-700 px-4 py-2 rounded-full font-medium">XLSX</div>
              <div className="bg-orange-100 text-orange-700 px-4 py-2 rounded-full font-medium">PPTX</div>
              <div className="bg-purple-100 text-purple-700 px-4 py-2 rounded-full font-medium">TXT</div>
              <div className="bg-pink-100 text-pink-700 px-4 py-2 rounded-full font-medium">CSV</div>
              <div className="bg-indigo-100 text-indigo-700 px-4 py-2 rounded-full font-medium">Images</div>
              <div className="bg-gray-100 text-gray-700 px-4 py-2 rounded-full font-medium">Scanned Docs</div>
            </div>
            <p className="text-gray-600">Even handles complex multi-page reports, scanned documents, and mixed layouts</p>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="py-20 bg-gradient-to-br from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Built for Professional Use Cases</h2>
            <p className="text-xl text-gray-600">Real solutions for real business challenges</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Accounting Firms */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="bg-green-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                  <DollarSign className="text-green-600 w-6 h-6" />
                </div>
                <h4 className="font-bold text-lg text-gray-900 mb-3">Accounting Firms</h4>
                <div className="space-y-2 text-sm text-gray-600">
                  <div>• Bank statement reconciliation</div>
                  <div>• Invoice and receipt processing</div>
                  <div>• Tax document preparation</div>
                  <div>• Client financial reporting</div>
                  <div>• Expense categorization</div>
                </div>
              </CardContent>
            </Card>

            {/* Legal Teams */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="bg-blue-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                  <Scale className="text-blue-600 w-6 h-6" />
                </div>
                <h4 className="font-bold text-lg text-gray-900 mb-3">Legal Teams</h4>
                <div className="space-y-2 text-sm text-gray-600">
                  <div>• Contract term extraction</div>
                  <div>• Due diligence document review</div>
                  <div>• Compliance reporting</div>
                  <div>• Legal brief analysis</div>
                  <div>• Client matter tracking</div>
                </div>
              </CardContent>
            </Card>

            {/* Investment Funds */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="bg-purple-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                  <TrendingUp className="text-purple-600 w-6 h-6" />
                </div>
                <h4 className="font-bold text-lg text-gray-900 mb-3">Investment Funds</h4>
                <div className="space-y-2 text-sm text-gray-600">
                  <div>• Portfolio company reporting</div>
                  <div>• Financial statement analysis</div>
                  <div>• Investment thesis tracking</div>
                  <div>• Performance benchmarking</div>
                  <div>• LP report generation</div>
                </div>
              </CardContent>
            </Card>

            {/* Corporate Finance */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="bg-orange-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                  <Building2 className="text-orange-600 w-6 h-6" />
                </div>
                <h4 className="font-bold text-lg text-gray-900 mb-3">Corporate Finance</h4>
                <div className="space-y-2 text-sm text-gray-600">
                  <div>• Budget vs actual analysis</div>
                  <div>• Vendor invoice processing</div>
                  <div>• Financial consolidation</div>
                  <div>• Audit preparation</div>
                  <div>• Management reporting</div>
                </div>
              </CardContent>
            </Card>

            {/* Insurance */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="bg-red-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                  <ShieldCheck className="text-red-600 w-6 h-6" />
                </div>
                <h4 className="font-bold text-lg text-gray-900 mb-3">Insurance</h4>
                <div className="space-y-2 text-sm text-gray-600">
                  <div>• Claims documentation</div>
                  <div>• Policy term extraction</div>
                  <div>• Risk assessment data</div>
                  <div>• Medical record processing</div>
                  <div>• Regulatory reporting</div>
                </div>
              </CardContent>
            </Card>

            {/* Real Estate */}
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="bg-teal-100 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                  <House className="text-teal-600 w-6 h-6" />
                </div>
                <h4 className="font-bold text-lg text-gray-900 mb-3">Real Estate</h4>
                <div className="space-y-2 text-sm text-gray-600">
                  <div>• Property valuation reports</div>
                  <div>• Lease agreement analysis</div>
                  <div>• Market research data</div>
                  <div>• Investment property metrics</div>
                  <div>• Title document review</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="text-center mt-12">
            <p className="text-gray-600 mb-6">Don't see your use case? CPAAutomation's custom field system adapts to any industry.</p>
            <Button onClick={handleGetStarted} className="lido-green hover:lido-green-dark text-white px-8 py-3">
              Start on Free Plan →
            </Button>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">What our customers are saying</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card>
              <CardContent className="p-8">
                <div className="w-16 h-16 rounded-full mb-4 bg-blue-100 flex items-center justify-center">
                  <span className="text-blue-600 font-bold text-lg">AM</span>
                </div>
                <div className="mb-4">
                  <h4 className="font-semibold text-gray-900">A*** Manufacturing</h4>
                  <p className="text-gray-600 text-sm">D*** Wilton, Supply Chain Director</p>
                </div>
                <h5 className="font-bold text-lg mb-2">Handles complex supplier documents</h5>
                <p className="text-gray-600">"We process thousands of supplier certifications, quality reports, and invoices monthly. The custom extraction feature lets us automatically categorize materials by grade and extract compliance codes for our procurement system."</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-8">
                <div className="w-16 h-16 rounded-full mb-4 bg-green-100 flex items-center justify-center">
                  <span className="text-green-600 font-bold text-lg">SV</span>
                </div>
                <div className="mb-4">
                  <h4 className="font-semibold text-gray-900">S****** Ventures</h4>
                  <p className="text-gray-600 text-sm">J*** Park, Partner</p>
                </div>
                <h5 className="font-bold text-lg mb-2">Essential for due diligence</h5>
                <p className="text-gray-600">"We evaluate hundreds of companies quarterly. Extracting financial metrics, revenue breakdowns, and key performance indicators from pitch decks and financial statements used to take weeks. Now it's literally done in minutes."</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-8">
                <div className="w-16 h-16 rounded-full mb-4 bg-purple-100 flex items-center justify-center">
                  <span className="text-purple-600 font-bold text-lg">NT</span>
                </div>
                <div className="mb-4">
                  <h4 className="font-semibold text-gray-900">N********** Technologies</h4>
                  <p className="text-gray-600 text-sm">A*** Kumar, CLO</p>
                </div>
                <h5 className="font-bold text-lg mb-2">Accelerates contract processing</h5>
                <p className="text-gray-600">"Our legal team reviews hundreds of vendor agreements monthly. We now extract key terms, pricing structures, and SLA commitments automatically. What used to take 3 hours per contract now takes two minutes."</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>



      {/* Case Study Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
            <CardContent className="p-12 text-center">
              <img src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?ixlib=rb-4.0.3&w=600&h=200&fit=crop" alt="Leonardo Family Office" className="mx-auto mb-6 rounded-lg" />
              <h2 className="text-3xl font-bold mb-4">A leading family office saves hundreds of hours per year processing investment statements</h2>
              <p className="text-xl mb-6">"Our team used to spend weeks manually extracting financial data from portfolio reports. Now we process quarterly statements from 100+ companies in just minutes with perfect accuracy."</p>
              <Link href="/case-study/LFO">
                <Button className="bg-white text-blue-600 hover:bg-gray-100">
                  Read the full case study →
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ROI & Benefits Section */}
      <section className="py-20 bg-gradient-to-r from-green-600 to-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">The ROI is Undeniable</h2>
            <p className="text-xl opacity-90">Real time savings from real customers</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
            <div className="text-center">
              <div className="text-4xl font-bold mb-2">95%</div>
              <div className="text-lg opacity-90">Time Reduction</div>
              <div className="text-sm opacity-75 mt-2">What took hours now takes minutes</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold mb-2">99.2%</div>
              <div className="text-lg opacity-90">Accuracy Rate</div>
              <div className="text-sm opacity-75 mt-2">Eliminates manual data entry errors</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold mb-2">$50K+</div>
              <div className="text-lg opacity-90">Annual Savings</div>
              <div className="text-sm opacity-75 mt-2">Per full-time equivalent replaced</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold mb-2">2 Weeks</div>
              <div className="text-lg opacity-90">Payback Period</div>
              <div className="text-sm opacity-75 mt-2">Typical ROI realization time</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <Card className="bg-white/10 border-white/20">
              <CardContent className="p-8">
                <h3 className="text-2xl font-bold mb-6 text-white">Before CPAAutomation</h3>
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                    <span className="text-white">Manual data entry takes 3-5 hours per document</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                    <span className="text-white">High error rates from manual transcription</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                    <span className="text-white">Staff spending time on repetitive tasks</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                    <span className="text-white">Delayed reporting and analysis</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                    <span className="text-white">Inconsistent data formatting</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/10 border-white/20">
              <CardContent className="p-8">
                <h3 className="text-2xl font-bold mb-6 text-white">After CPAAutomation</h3>
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-white">Automated processing in under 5 minutes</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-white">99%+ accuracy with AI extraction</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-white">Staff focused on high-value analysis</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-white">Real-time reporting and insights</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-white">Standardized, clean data output</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="text-center mt-12">
            <p className="text-xl mb-6 opacity-90">Discover your savings starting with the free plan</p>
            <Button onClick={handleGetStarted} className="bg-white text-green-600 hover:bg-gray-100 px-8 py-3 text-lg font-semibold">
              Start Discovering ROI →
            </Button>
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Enterprise-Grade Security & Compliance</h2>
            <p className="text-xl text-gray-600">Your data security is our top priority. Built for professional services.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
            <div className="text-center">
              <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="text-blue-600 w-8 h-8" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">TLS 1.3 Encryption</h4>
              <p className="text-sm text-gray-600">All data transfers use the latest encryption protocols</p>
            </div>
            
            <div className="text-center">
              <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <MapPinCheck className="text-green-600 w-8 h-8" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">US-Only Hosting</h4>
              <p className="text-sm text-gray-600">Google Cloud US regions with SOC 2 compliance</p>
            </div>
            
            <div className="text-center">
              <div className="bg-purple-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Lock className="text-purple-600 w-8 h-8" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">AES-256 Encryption</h4>
              <p className="text-sm text-gray-600">Military-grade encryption for data at rest</p>
            </div>
            
            <div className="text-center">
              <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <Ban className="text-red-600 w-8 h-8" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Zero Data Training</h4>
              <p className="text-sm text-gray-600">Your documents never train AI models</p>
            </div>
          </div>

          {/* Additional Security Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <Card>
              <CardContent className="p-6">
                <h4 className="font-semibold text-gray-900 mb-3">Data Handling</h4>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-center space-x-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>Automatic data deletion after processing</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>Audit logs for all activities</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h4 className="font-semibold text-gray-900 mb-3">Compliance</h4>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-center space-x-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>GDPR compliant</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>CCPA compliant</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h4 className="font-semibold text-gray-900 mb-3">Professional Standards</h4>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-center space-x-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>CPA firm security requirements</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Check className="w-4 h-4 text-green-500" />
                    <span>Legal industry standards</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="text-center">
            <p className="text-gray-600 mb-4">Need enterprise security documentation or custom compliance requirements?</p>
            <Link href="/contact">
              <Button variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-100">
                Contact Security Team →
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Frequently Asked Questions</h2>
            <p className="text-xl text-gray-600">Everything you need to know about CPAAutomation</p>
          </div>
          
          <div className="space-y-8">
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">How accurate is the AI extraction?</h3>
                <p className="text-gray-600">Our AI achieves 99%+ accuracy on structured documents like invoices and financial statements. For complex documents, accuracy typically ranges from 95-99%. You can always review and edit results before export.</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">What file types are supported?</h3>
                <p className="text-gray-600">We support PDF, DOCX, XLSX, PPTX, TXT, CSV, and most image formats (PNG, JPG, TIFF). We can also process scanned documents and handle multi-page files with complex layouts.</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">How does email automation work?</h3>
                <p className="text-gray-600">Simply forward emails with PDF attachments to document@cpaautomation.ai. Our system matches your sender email to your account, applies your automation filters, and processes documents using your configured templates. Results are automatically exported to your chosen destination.</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Can I customize the extraction fields?</h3>
                <p className="text-gray-600">Absolutely! You can create custom fields with your own prompts, data types, and formatting rules. Add accounting codes, classification rules, or any business-specific logic. Templates can be saved and reused across projects.</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Is there a learning curve?</h3>
                <p className="text-gray-600">CPAAutomation is designed for professionals who don't have time for complex training. Most users are extracting data within 10 minutes of signing up. Our CPA-designed interface follows familiar workflows.</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">What about data security and privacy?</h3>
                <p className="text-gray-600">Your data is encrypted in transit and at rest, hosted only in US data centers, and automatically deleted after processing. We never use your documents to train AI models. Our platform meets the security standards required by CPA firms and legal practices.</p>
              </CardContent>
            </Card>
          </div>

          <div className="text-center mt-12">
            <p className="text-gray-600 mb-6">Still have questions? We're here to help.</p>
            <div className="flex justify-center space-x-4">
              <Link href="/contact">
                <Button variant="outline">Contact Support</Button>
              </Link>
              <Button onClick={handleGetStarted} className="lido-green hover:lido-green-dark text-white">
                Start Free Plan →
              </Button>
            </div>
          </div>
        </div>
      </section>


    </div>
  );
}
