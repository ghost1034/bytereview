'use client'

'use client'

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Database, Table, Bot, Check, FileText, Grid3X3, Settings } from "lucide-react";
import { FaGoogle, FaMicrosoft, FaFileExcel } from "react-icons/fa";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

export default function Features() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">Everything you need to extract data from any file</h1>
          <p className="text-xl text-gray-600">No complex training required — just type in plain English.</p>
        </div>

        {/* Data Extractor Feature */}
        <div className="mb-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="bg-blue-100 w-16 h-16 rounded-lg flex items-center justify-center mb-6">
                <FileText className="text-blue-600 w-8 h-8" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Data extractor</h2>
              <p className="text-lg text-gray-600 mb-6">
                Intelligently extract and structure key information from any document type with precision. 
                Advanced algorithms understand context and maintain data relationships while converting 
                unstructured content into organized, actionable insights.
              </p>
              
              <h4 className="font-semibold text-gray-900 mb-4">Great for...</h4>
              <div className="grid grid-cols-2 gap-2 mb-6">
                <div className="flex items-center space-x-2">
                  <Check className="text-blue-500 w-4 h-4" />
                  <span className="text-gray-700">Financial statements</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="text-blue-500 w-4 h-4" />
                  <span className="text-gray-700">Contract documents</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="text-blue-500 w-4 h-4" />
                  <span className="text-gray-700">Medical records</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="text-blue-500 w-4 h-4" />
                  <span className="text-gray-700">Legal forms</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="text-blue-500 w-4 h-4" />
                  <span className="text-gray-700">Research papers</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="text-blue-500 w-4 h-4" />
                  <span className="text-gray-700">Technical reports</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="text-blue-500 w-4 h-4" />
                  <span className="text-gray-700">Compliance documents</span>
                </div>
              </div>
              
              <Link href={user ? "/dashboard" : "/demo"}>
                <Button className="lido-blue hover:lido-blue-dark text-white">
                  {user ? "Go to Dashboard →" : "Try It Now →"}
                </Button>
              </Link>
            </div>
            
            <div>
              <img 
                src="https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?ixlib=rb-4.0.3&w=600&h=400&fit=crop" 
                alt="Data extraction example showing invoice processing" 
                className="rounded-xl shadow-lg w-full"
              />
            </div>
          </div>
        </div>

        {/* Table Extractor Feature */}
        <div className="mb-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1">
              <img 
                src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?ixlib=rb-4.0.3&w=600&h=400&fit=crop" 
                alt="Table extraction example showing spreadsheet with highlighted table" 
                className="rounded-xl shadow-lg w-full"
              />
            </div>
            
            <div className="order-1 lg:order-2">
              <div className="bg-purple-100 w-16 h-16 rounded-lg flex items-center justify-center mb-6">
                <Grid3X3 className="text-purple-600 w-8 h-8" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Table extractor</h2>
              <p className="text-lg text-gray-600 mb-6">
                Advanced table recognition that captures complex layouts and preserves data relationships. 
                Handles multi-column formats, nested headers, and irregular table structures with high accuracy.
              </p>
              
              <h4 className="font-semibold text-gray-900 mb-4">Great for...</h4>
              <div className="grid grid-cols-2 gap-2 mb-6">
                <div className="flex items-center space-x-2">
                  <Check className="text-blue-500 w-4 h-4" />
                  <span className="text-gray-700">Multi-page reports</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="text-blue-500 w-4 h-4" />
                  <span className="text-gray-700">Complex spreadsheets</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="text-blue-500 w-4 h-4" />
                  <span className="text-gray-700">Financial tables</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="text-blue-500 w-4 h-4" />
                  <span className="text-gray-700">Data matrices</span>
                </div>
              </div>
              
              <Link href={user ? "/dashboard" : "/demo"}>
                <Button className="lido-blue hover:lido-blue-dark text-white">
                  {user ? "Go to Dashboard →" : "Try It Now →"}
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* AI Editor Feature */}
        <div className="mb-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="bg-orange-100 w-16 h-16 rounded-lg flex items-center justify-center mb-6">
                <Settings className="text-orange-600 w-8 h-8" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Custom extraction at will</h2>
              <p className="text-lg text-gray-600 mb-6">
                <strong>Create custom columns with self-defined formats and prompts.</strong> Users have the ability to 
                classify data, add further details like accounting G/L codes, and create intelligent categorization 
                rules tailored to their specific business needs.
              </p>
              
              <h4 className="font-semibold text-gray-900 mb-4">Great for...</h4>
              <div className="grid grid-cols-2 gap-2 mb-6">
                <div className="flex items-center space-x-2">
                  <Check className="text-blue-500 w-4 h-4" />
                  <span className="text-gray-700">Custom data formats</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="text-blue-500 w-4 h-4" />
                  <span className="text-gray-700">Classification rules</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="text-blue-500 w-4 h-4" />
                  <span className="text-gray-700">Accounting codes</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="text-blue-500 w-4 h-4" />
                  <span className="text-gray-700">Smart categorization</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Check className="text-blue-500 w-4 h-4" />
                  <span className="text-gray-700">Business rule automation</span>
                </div>
              </div>
              
              <Link href={user ? "/dashboard" : "/demo"}>
                <Button className="lido-blue hover:lido-blue-dark text-white">
                  {user ? "Go to Dashboard →" : "Try It Now →"}
                </Button>
              </Link>
            </div>
            
            <div>
              <img 
                src="https://images.unsplash.com/photo-1485827404703-89b55fcc595e?ixlib=rb-4.0.3&w=600&h=400&fit=crop" 
                alt="AI data cleaning interface showing before and after data transformation" 
                className="rounded-xl shadow-lg w-full"
              />
            </div>
          </div>
        </div>


      </div>
    </div>
  );
}
