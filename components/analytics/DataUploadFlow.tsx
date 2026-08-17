'use client'

import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  Upload, FileSpreadsheet, FileText, CheckCircle2, AlertCircle, X,
  ChevronRight, Download, FileImage, Trash2, AlertTriangle,
  RefreshCw, Edit3, FileDown, CheckCircle, Plus, Settings, Layers, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCurrentAuthToken } from '@/lib/firebase';
import { INITIAL_SOURCE_A, INITIAL_SOURCE_B } from '@/lib/analytics/mockReconData';

export type UploadModule = 'variance' | 'reconciliation' | 'amortization' | 'waterfall';
export type UploadType = 'bulk' | 'ai-extraction';

interface ValidationError {
  id: string;
  row: number;
  field: string;
  message: string;
  value: any;
  severity: 'error' | 'warning';
  code: string;
  isFixed?: boolean;
  fileName?: string;
  fileRole?: string;
  parsedDataIndex?: number;
}

interface DataUploadFlowProps {
  module: UploadModule;
  uploadType?: UploadType;
  varianceMode?: 'single' | 'dual';
  onComplete?: (data?: any) => void;
  onCancel?: () => void;
  onStepChange?: (step: number) => void;
}

const ERROR_CATALOG = {
  'UPL-001': 'Unsupported file format. This upload accepts [CSV, Excel] files only.',
  'UPL-002': 'File too large. Maximum file size is [limit].',
  'UPL-003': 'Empty file. The selected file contains no data.',
  'UPL-004': 'Unable to read file. The file may be corrupted or in an unsupported encoding.',
  'UPL-005': 'Password-protected file. Please remove the password protection.',
  'UPL-013': 'Too many rows. This file exceeds the maximum of [limit] rows.',
  'UPL-020': 'Required columns not mapped: [list].',
  'UPL-022': 'Wrong template. This file doesn\'t match the expected template.',
  'UPL-030': 'Missing required field.',
  'UPL-031': 'Invalid amount format.',
  'UPL-032': 'Invalid date format.',
  'UPL-033': 'End Date must be after Start Date.',
  'UPL-034': 'Unrecognized value for [field].',
  'UPL-035': 'Amount must be greater than zero.',
  'UPL-037': 'Missing conditionally required field.',
  'UPL-040': 'Salvage value cannot exceed cost.',
  'UPL-050': 'Unsupported format for AI extraction. Please upload PDF or image.',
  'UPL-052': 'Low scan quality detected (below 200 DPI).',
  'UPL-054': 'Low confidence extraction. Please verify all fields.',
};

export default function DataUploadFlow({ module, uploadType = 'bulk', varianceMode = 'dual', onComplete, onCancel, onStepChange }: DataUploadFlowProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [files, setFiles] = useState<{file: File, role?: string, sheet?: string}[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [showValidationSummary, setShowValidationSummary] = useState(false);
  const [signConvention, setSignConvention] = useState<'debit' | 'credit'>('debit');
  const [fileLevelError, setFileLevelError] = useState<string | null>(null);
  const [sourceColumns, setSourceColumns] = useState<string[]>([]);
  // file identifier (role or name) -> target field -> source field
  const [columnMapping, setColumnMapping] = useState<Record<string, Record<string, string>>>({}); 
  const [fileHeaders, setFileHeaders] = useState<Record<string, string[]>>({});
  const [customColumns, setCustomColumns] = useState<string[]>([]);
  const [parsedData, setParsedData] = useState<any[]>([]);

  const [hiddenOptionalColumns, setHiddenOptionalColumns] = useState<string[]>([]);

  useEffect(() => {
    if (onStepChange) {
      onStepChange(step);
    }
  }, [step, onStepChange]);

  const getConfig = () => {
    const base = {
      maxSize: 50 * 1024 * 1024,
      maxRows: 50000,
      roles: undefined as string[] | undefined,
      requiredColumns: undefined as string[] | undefined,
      optionalColumns: undefined as string[] | undefined,
      templateName: undefined as string | null | undefined,
    };

    if (module === 'variance') {
      if (varianceMode === 'single') {
        return {
          ...base,
          title: 'Variance & Flux Analysis Upload',
          description: 'Upload a single dataset containing both periods.',
          accept: '.csv,.xlsx,.xls',
          formatsText: 'CSV, Excel (.xlsx, .xls)',
          multiple: false,
          maxFiles: 1,
          roles: undefined,
          templateName: 'Variance_Template_Single.csv',
          requiredColumns: ['Account Name/Number', 'Amount', 'Period/Date', 'Description/Memo'],
          optionalColumns: ['Class/Department']
        };
      } else {
        return {
          ...base,
          title: 'Variance & Flux Analysis Upload',
          description: 'Upload Base Period and Comparison Period datasets separately.',
          accept: '.csv,.xlsx,.xls',
          formatsText: 'CSV, Excel (.xlsx, .xls)',
          multiple: true,
          maxFiles: 2,
          roles: ['Base Period', 'Comparison Period'],
          templateName: 'Variance_Template_Dual.csv',
          requiredColumns: ['Account Name/Number', 'Amount', 'Description/Memo'],
          optionalColumns: ['Class/Department']
        };
      }
    }
    if (module === 'reconciliation') {
      return {
        ...base,
        maxRows: 100000,
        title: 'Reconciliation Source Data',
        description: 'Upload Source A and Source B.',
        accept: '.csv,.xlsx,.xls',
        formatsText: 'CSV, Excel (.xlsx, .xls)',
        multiple: true,
        maxFiles: 2,
        roles: ['Source A', 'Source B'],
        templateName: 'Reconciliation_Template.csv',
        requiredColumns: ['Transaction Date', 'Description', 'Amount'],
        optionalColumns: ['Reference ID']
      };
    }
    if (module === 'amortization' || module === 'waterfall') {
        return {
          ...base,
          maxRows: 5000,
          title: `${module.charAt(0).toUpperCase() + module.slice(1)} Bulk Upload`,
          description: 'Upload multiple records using the standard template.',
          accept: '.csv,.xlsx',
          formatsText: 'CSV, Excel (.xlsx)',
          multiple: false,
          maxFiles: 1,
          templateName: `${module.charAt(0).toUpperCase() + module.slice(1)}_Bulk_Template.csv`,
          requiredColumns: module === 'amortization' 
            ? ['Asset Name', 'Asset Type', 'Acquisition Cost', 'Start Date', 'Useful Life (Months)', 'GAAP Method', 'Tax Method', 'Expense Account', 'Accumulated Account']
            : ['Contract Name', 'Type', 'Total Amount', 'Start Date', 'End Date', 'Recognition Method'],
          optionalColumns: module === 'amortization'
            ? ['Asset Tag / ID', 'Client / Entity', 'Department', 'Location', 'Vendor / Supplier', 'Salvage Value', 'Status', 'Asset Category', 'Physical Condition', 'Is QIP', 'Software Stage', 'Use Type', 'Total Capitalized Cost', 'Intangible Type', 'Life Type', 'Legal Life (Months)', 'Lease Classification', 'Payment Amount', 'Payment Frequency', 'Incremental Borrowing Rate', 'Payment Timing', 'Loan Type', 'Principal Amount', 'Interest Rate', 'Rate Type', 'Compounding Frequency', 'Loan Term', 'Amortization Term', 'Balloon Payment', 'Origination Date', 'First Payment Date', 'MACRS Property Class', 'MACRS System', 'Convention', 'Section 179 Election', 'Section 179 Amount', 'Bonus Depreciation Election', 'Bonus Depreciation Percentage', 'State Tax Treatment', 'State Specific Method', 'Listed Property', 'Business Use %']
            : ['Party Name', 'Expense Category', 'Payment Date', 'Expected Payment Date', 'Reversal Method', 'Commission Type', 'Benefit Period Method', 'Deferred Account', 'Revenue Account', 'Prepaid Account', 'Expense Account', 'Liability Account', 'Deferred Commission Account', 'Commission Expense Account']
        };
    }
    
    return {
      ...base,
      title: 'Data Upload',
      description: 'Upload your data file.',
      accept: '.csv,.xlsx,.xls',
      formatsText: 'CSV, Excel (.xlsx, .xls)',
      multiple: false,
      maxFiles: 1,
      templateName: 'Template.csv'
    };
  };

  const config = getConfig();

  // Simulate extracting columns from the file
  const extractColumns = (mod: UploadModule) => {
    if (mod === 'variance') return ['Account Name', 'Account_ID', 'Amount_USD', 'Date', 'Description/Memo', 'Class/Department', 'Location'];
    if (mod === 'reconciliation') return ['Txn_Date', 'Description', 'Amount', 'Reference', 'Bank_ID'];
    if (mod === 'amortization') return ['Asset Name', 'Type', 'Total Amount', 'Start Date', 'End Date', 'GAAP Method', 'Tax Method', 'Salvage Value', 'Tax Life (Months)', 'Vendor'];
    if (mod === 'waterfall') return ['Contract Name', 'Type', 'Total Amount', 'Start Date', 'End Date', 'Recognition Method', 'Customer'];
    return ['Column A', 'Column B', 'Column C'];
  };

  const autoMapColumns = (sourceCols: string[], requiredCols: string[]) => {
    const mapping: Record<string, string> = {};
    
    requiredCols.forEach(targetCol => {
      // 1. Exact match (case-insensitive)
      let match = sourceCols.find(c => (c || '').toLowerCase() === (targetCol || '').toLowerCase());
      
      // 2. Fuzzy match (remove spaces, underscores, etc.)
      if (!match) {
        const normalize = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const normalizedTarget = normalize(targetCol);
        match = sourceCols.find(c => normalize(c).includes(normalizedTarget) || normalizedTarget.includes(normalize(c)));
      }
      
      // 3. Common aliases
      if (!match) {
        const aliases: Record<string, string[]> = {
          'Amount': ['Amount_USD', 'Value', 'Total', 'Cost'],
          'Total Amount': ['Amount_USD', 'Value', 'Total', 'Cost', 'Amount'],
          'Transaction Date': ['Txn_Date', 'Date', 'Posting Date'],
          'Account Name/Number': ['Account', 'Account_ID', 'GL Account', 'Account Name', 'Account Number', 'Acct'],
          'Description': ['Desc', 'Memo', 'Details', 'Desc_Field'],
          // Variance-specific column aliases
          'Description/Memo': ['Description', 'Desc', 'Memo', 'Details', 'Notes', 'Memo/Description'],
          'Period/Date': ['Period', 'Date', 'Posting Date', 'Txn_Date', 'Transaction Date', 'Month', 'Quarter', 'Fiscal Period'],
          'Class/Department': ['Department', 'Class', 'Cost Center', 'Division', 'Dept'],
          // Waterfall bulk-upload header variants
          'Contract Name': ['Name', 'Schedule Name', 'Contract', 'Schedule'],
          'Party Name': ['Customer', 'Vendor', 'Counterparty', 'Client', 'Party', 'Supplier'],
          'Type': ['Schedule Type', 'Category', 'Waterfall Type'],
          'Recognition Method': ['Method', 'Rec Method', 'Recognition'],
          'Start Date': ['Effective Date', 'Begin Date', 'Commencement Date'],
          'End Date': ['Expiry Date', 'Expiration Date', 'Termination Date'],
          'Expense Category': ['Category', 'Expense Type'],
          'Payment Date': ['Paid Date', 'Invoice Date'],
          'Expected Payment Date': ['Expected Pay Date', 'Settlement Date']
        };
        
        const targetAliases = aliases[targetCol] || [];
        match = sourceCols.find(c => targetAliases.some(a => (c || '').toLowerCase().includes((a || '').toLowerCase())));
      }
      
      if (match) {
        mapping[targetCol] = match;
      }
    });
    
    return mapping;
  };

  const validateFile = (file: File) => {
    if (file.size > config.maxSize) {
      return ERROR_CATALOG['UPL-002'].replace('[limit]', `${config.maxSize / (1024 * 1024)}MB`);
    }
    const ext = (file.name || '').split('.').pop()?.toLowerCase();
    if (!config.accept.includes(`.${ext}`)) {
      return ERROR_CATALOG['UPL-001'].replace('[ext]', ext || '');
    }
    if (file.size === 0) {
      return ERROR_CATALOG['UPL-003'];
    }
    return null;
  };

  const getHeaders = async (file: File): Promise<string[]> => {
    const data = await parseFile(file);
    if (data.length > 0) {
      return Object.keys(data[0]);
    }
    return [];
  };

  const processFilesForMapping = async (newFiles: {file: File, role?: string}[], extraTargets: string[] = []) => {
    let allCols: string[] = [];
    const newHeaders: Record<string, string[]> = {};
    const newMappings: Record<string, Record<string, string>> = {};
    
    for (const f of newFiles) {
      const fileKey = f.role || f.file.name;
      const cols = await getHeaders(f.file);
      newHeaders[fileKey] = cols;
      allCols = [...allCols, ...cols];
      
      const allPossibleTargets = [
        ...(config.requiredColumns || []),
        ...(config.optionalColumns || []),
        ...extraTargets
      ];
      if (allPossibleTargets.length > 0) {
        newMappings[fileKey] = autoMapColumns(cols, allPossibleTargets);
      }
    }
    
    const uniqueCols = Array.from(new Set(allCols));
    setFileHeaders(newHeaders);
    setSourceColumns(uniqueCols);
    setColumnMapping(newMappings);
    return uniqueCols;
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setFileLevelError(null);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files).slice(0, config.maxFiles);
      const newFiles: {file: File, role?: string}[] = [];
      
      for (const f of droppedFiles) {
        const error = validateFile(f);
        if (error) {
          setFileLevelError(error);
          return;
        }
        newFiles.push({ file: f, role: config.roles ? config.roles[newFiles.length] : undefined });
      }
      
      setFiles(newFiles);
      await processFilesForMapping(newFiles);
      setStep(2);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileLevelError(null);
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files).slice(0, config.maxFiles);
      const newFiles: {file: File, role?: string}[] = [];
      
      for (const f of selectedFiles) {
        const error = validateFile(f);
        if (error) {
          setFileLevelError(error);
          return;
        }
        newFiles.push({ file: f, role: config.roles ? config.roles[newFiles.length] : undefined });
      }
      
      setFiles(newFiles);
      await processFilesForMapping(newFiles);
      setStep(2);
    }
  };

  const handleDemoData = async () => {
    setFileLevelError(null);
    const newFiles: {file: File, role?: string}[] = [];
    
    if (module === 'variance') {
      const generateRows = (count: number, isDual: boolean, period?: string) => {
        const rows = [];
        const depts = ['Engineering', 'Sales', 'Marketing', 'G&A', 'IT'];
        const locations = ['San Francisco', 'New York', 'Austin', 'Remote'];
        
        const accounts = [
          { id: '6000-01', name: 'Salaries', baseAmount: 8000, desc: ['Bi-weekly payroll', 'Bonus payout', 'Contractor payment'] },
          { id: '6100-01', name: 'Marketing - Digital Ads', baseAmount: 2000, desc: ['Google Ads', 'LinkedIn Campaign', 'Meta Ads'] },
          { id: '6200-01', name: 'COGS - Cloud Hosting', baseAmount: 5000, desc: ['AWS EC2', 'AWS S3', 'GCP Compute', 'Azure Services'] },
          { id: '6300-01', name: 'Rent & Utilities', baseAmount: 15000, desc: ['Monthly Rent', 'Electricity', 'Internet', 'Water'] },
          { id: '6400-01', name: 'Travel - Domestic', baseAmount: 800, desc: ['Flight to NY', 'Hotel stay', 'Uber/Lyft', 'Client dinner'] },
          { id: '6500-01', name: 'Software - Productivity', baseAmount: 300, desc: ['Slack renewal', 'Zoom licenses', 'Microsoft 365', 'Notion'] },
          { id: '6600-01', name: 'Professional Fees - Legal', baseAmount: 4000, desc: ['Contract review', 'IP filing', 'General counsel'] },
          { id: '6700-01', name: 'Office Supplies', baseAmount: 150, desc: ['Amazon purchase', 'Staples', 'Snacks', 'Coffee'] },
        ];
        
        for (let i = 0; i < count; i++) {
          const acct = accounts[i % accounts.length];
          const dept = depts[i % depts.length];
          const loc = locations[i % locations.length];
          
          // Add some randomness to the amount
          const amount = (acct.baseAmount * (0.5 + Math.random())).toFixed(2);
          const desc = acct.desc[i % acct.desc.length];
          const fullAcctName = `${acct.id} ${acct.name}`;
          
          let row = '';
          if (isDual) {
            row = `${fullAcctName},${amount},${desc} - ${loc},${dept},${loc}`;
          } else {
            row = `${fullAcctName},${amount},${period || '2025-08-15'},${desc} - ${loc},${dept},${loc}`;
          }
          rows.push(row);
        }

        return rows;
      };

      if (varianceMode === 'single') {
        const header = 'Account Name/Number,Amount,Period/Date,Description/Memo,Class/Department,Location';
        const q3Rows = generateRows(50, false, '2025-08-15');
        const q4Rows = generateRows(50, false, '2025-11-15');
        const csvContent = [header, ...q3Rows, ...q4Rows].join('\n');
        newFiles.push({ file: new File([csvContent], 'Realistic_Large_Variance_Data_2025.csv', { type: 'text/csv' }) });
      } else {
        const header = 'Account Name/Number,Amount,Description/Memo,Class/Department,Location';
        const baseRows = generateRows(100, true);
        const compRows = generateRows(100, true);
        const baseCsv = [header, ...baseRows].join('\n');
        const compCsv = [header, ...compRows].join('\n');
        newFiles.push({ file: new File([baseCsv], 'Base_Period_Large_Q3.csv', { type: 'text/csv' }), role: 'Base Period' });
        newFiles.push({ file: new File([compCsv], 'Comparison_Period_Large_Q4.csv', { type: 'text/csv' }), role: 'Comparison Period' });
      }
    } else if (module === 'reconciliation') {
      const bankCsv = Papa.unparse(INITIAL_SOURCE_A.map((t: any) => ({
        'Transaction Date': t.date,
        'Description': t.description,
        'Amount': t.amount,
        'Reference ID': t.id,
        'Category': t.exceptionCategory || '',
        'Reasoning': t.exceptionReasoning || ''
      })));
      const glCsv = Papa.unparse(INITIAL_SOURCE_B.map((t: any) => ({
        'Transaction Date': t.date,
        'Description': t.description,
        'Amount': t.amount,
        'Reference ID': t.id,
        'Category': t.exceptionCategory || '',
        'Reasoning': t.exceptionReasoning || ''
      })));
      newFiles.push({ file: new File([bankCsv], 'SourceA_Data.csv', { type: 'text/csv' }), role: 'Source A' });
      newFiles.push({ file: new File([glCsv], 'SourceB_Data.csv', { type: 'text/csv' }), role: 'Source B' });
    } else if (module === 'amortization') {
      const allCols = [...(config.requiredColumns || []), ...(config.optionalColumns || [])];
      const header = allCols.join(',');
      
      const createRow = (dataDict: Record<string, any>) => {
        return allCols.map(col => {
          const val = dataDict[col];
          return val !== undefined ? String(val).replace(/,/g, '') : '';
        }).join(',');
      };

      const rows = [
        createRow({
          'Asset Name': 'Enterprise Software License', 'Asset Type': 'Software Costs', 'Asset Tag / ID': 'SW-101', 'Client / Entity': 'Acme Corp', 'Department': 'IT', 'Location': 'HQ', 'Vendor / Supplier': 'Microsoft', 'Acquisition Cost': 120000, 'Salvage Value': 0, 'Start Date': '2026-01-01', 'Useful Life (Months)': 36, 'GAAP Method': 'Straight-Line', 'Tax Method': 'Straight-Line', 'Status': 'Active', 'Expense Account': '6000 — Expense', 'Accumulated Account': '1600 — Accumulated', 'Software Stage': 'Application Development', 'Use Type': 'Internal-Use', 'Total Capitalized Cost': 120000, 'MACRS Property Class': '5-year', 'MACRS System': 'GDS', 'Convention': 'Half-Year', 'Section 179 Election': 'false', 'Section 179 Amount': 0, 'Bonus Depreciation Election': 'false', 'Bonus Depreciation Percentage': '40%', 'State Tax Treatment': 'Conforms to Federal', 'Listed Property': 'false', 'Business Use %': 100
        }),
        createRow({
          'Asset Name': 'HQ Office Lease', 'Asset Type': 'Lease', 'Asset Tag / ID': 'L-201', 'Client / Entity': 'Acme Corp', 'Department': 'Operations', 'Location': 'HQ', 'Vendor / Supplier': 'Acme Properties LLC', 'Acquisition Cost': 3150000, 'Salvage Value': 0, 'Start Date': '2026-01-01', 'Useful Life (Months)': 120, 'GAAP Method': 'Straight-Line', 'Tax Method': 'Straight-Line', 'Status': 'Active', 'Expense Account': '6000 — Rent Expense', 'Accumulated Account': '1600 — ROU Asset', 'Lease Classification': 'Operating', 'Payment Amount': 26250, 'Payment Frequency': 'Monthly', 'Incremental Borrowing Rate': 5.5, 'Payment Timing': 'Beginning of Period', 'MACRS Property Class': '15-year', 'MACRS System': 'GDS', 'Convention': 'Half-Year', 'Section 179 Election': 'false', 'Section 179 Amount': 0, 'Bonus Depreciation Election': 'false', 'State Tax Treatment': 'Conforms to Federal', 'Listed Property': 'false', 'Business Use %': 100
        }),
        createRow({
          'Asset Name': 'Dell PowerEdge Servers', 'Asset Type': 'Fixed Assets', 'Asset Tag / ID': 'FA-301', 'Client / Entity': 'Acme Corp', 'Department': 'IT', 'Location': 'HQ', 'Vendor / Supplier': 'Dell Technologies', 'Acquisition Cost': 45000, 'Salvage Value': 2000, 'Start Date': '2026-02-01', 'Useful Life (Months)': 60, 'GAAP Method': 'Straight-Line', 'Tax Method': 'MACRS', 'Status': 'Active', 'Expense Account': '6000 — IT Expense', 'Accumulated Account': '1600 — Accumulated Depreciation', 'Asset Category': 'Computer & IT', 'Physical Condition': 'New', 'Is QIP': 'false', 'MACRS Property Class': '5-year', 'MACRS System': 'GDS', 'Convention': 'Half-Year', 'Section 179 Election': 'true', 'Section 179 Amount': 20000, 'Bonus Depreciation Election': 'true', 'Bonus Depreciation Percentage': '80%', 'State Tax Treatment': 'Conforms to Federal', 'Listed Property': 'true', 'Business Use %': 80
        }),
        createRow({
          'Asset Name': 'Delivery Van', 'Asset Type': 'Fixed Assets', 'Asset Tag / ID': 'FA-401', 'Client / Entity': 'Acme Corp', 'Department': 'Logistics', 'Location': 'Warehouse', 'Vendor / Supplier': 'Ford Commercial', 'Acquisition Cost': 55000, 'Salvage Value': 5000, 'Start Date': '2026-01-01', 'Useful Life (Months)': 60, 'GAAP Method': 'Straight-Line', 'Tax Method': 'MACRS', 'Status': 'Active', 'Expense Account': '6000 — Vehicle Expense', 'Accumulated Account': '1600 — Accumulated Depreciation', 'Asset Category': 'Vehicles', 'Physical Condition': 'New', 'Is QIP': 'false', 'MACRS Property Class': '5-year', 'MACRS System': 'GDS', 'Convention': 'Half-Year', 'Section 179 Election': 'true', 'Section 179 Amount': 55000, 'Bonus Depreciation Election': 'false', 'State Tax Treatment': 'Conforms to Federal', 'Listed Property': 'true', 'Business Use %': 100
        }),
        createRow({
          'Asset Name': 'Equipment Loan', 'Asset Type': 'Financing/Loan', 'Asset Tag / ID': 'LN-501', 'Client / Entity': 'Acme Corp', 'Department': 'Finance', 'Location': 'HQ', 'Vendor / Supplier': 'Chase Bank', 'Acquisition Cost': 150000, 'Salvage Value': 0, 'Start Date': '2026-01-01', 'Useful Life (Months)': 60, 'GAAP Method': 'Straight-Line', 'Tax Method': 'Straight-Line', 'Status': 'Active', 'Expense Account': '6000 — Interest Expense', 'Accumulated Account': '1600 — Loan Payable', 'Loan Type': 'Term Loan', 'Principal Amount': 150000, 'Interest Rate': 6.5, 'Rate Type': 'Fixed', 'Compounding Frequency': 'Monthly', 'Loan Term': 60, 'Amortization Term': 60, 'Balloon Payment': 0, 'Origination Date': '2026-01-01', 'First Payment Date': '2026-02-01'
        }),
        createRow({
          'Asset Name': 'Patent Holding Base', 'Asset Type': 'Intangible Assets', 'Asset Tag / ID': 'IA-601', 'Client / Entity': 'Acme Corp', 'Department': 'IP', 'Location': 'HQ', 'Vendor / Supplier': 'USPTO', 'Acquisition Cost': 80000, 'Salvage Value': 0, 'Start Date': '2026-01-01', 'Useful Life (Months)': 180, 'GAAP Method': 'Straight-Line', 'Tax Method': 'Straight-Line', 'Status': 'Active', 'Expense Account': '6000 — Amortization Expense', 'Accumulated Account': '1600 — Accumulated Amortization', 'Intangible Type': 'Patent', 'Life Type': 'Definite', 'Legal Life (Months)': 180
        })
      ];
      const csvContent = [header, ...rows].join('\n');
      newFiles.push({ file: new File([csvContent], 'Amortization_Bulk_Data.csv', { type: 'text/csv' }) });
    } else if (module === 'waterfall') {
      const allCols = [...(config.requiredColumns || []), ...(config.optionalColumns || [])];
      const header = allCols.join(',');
      
      const createRow = (dataDict: Record<string, any>) => {
        return allCols.map(col => {
          const val = dataDict[col];
          return val !== undefined ? String(val).replace(/,/g, '') : '';
        }).join(',');
      };

      const rows = [
        createRow({
          'Contract Name': 'Acme Corp — SaaS License 2026', 'Type': 'Deferred Revenue', 'Total Amount': 120000, 'Start Date': '2026-01-01', 'End Date': '2026-12-31', 'Recognition Method': 'Straight-Line', 'Party Name': 'Acme Corp', 'Payment Date': '2026-01-01', 'Deferred Account': '2400 — Deferred Revenue', 'Revenue Account': '4100 — SaaS Revenue'
        }),
        createRow({
          'Contract Name': 'Commercial Auto Insurance', 'Type': 'Prepaid Expenses', 'Total Amount': 24000, 'Start Date': '2026-02-01', 'End Date': '2027-01-31', 'Recognition Method': 'Pro-Rata Daily', 'Party Name': 'Travelers', 'Expense Category': 'Insurance', 'Payment Date': '2026-01-15', 'Prepaid Account': '1300 — Prepaid Insurance', 'Expense Account': '6200 — Insurance Expense'
        }),
        createRow({
          'Contract Name': 'Q1 2026 Bonus Accrual', 'Type': 'Accrued Expenses', 'Total Amount': 45000, 'Start Date': '2026-01-01', 'End Date': '2026-03-31', 'Recognition Method': 'Straight-Line', 'Party Name': 'Employees', 'Expense Category': 'Bonuses', 'Expected Payment Date': '2026-04-15', 'Reversal Method': 'Reverse on Payment Date', 'Liability Account': '2100 — Accrued Bonuses', 'Expense Account': '6100 — Bonus Expense'
        }),
        createRow({
          'Contract Name': 'Enterprise Deal Commission', 'Type': 'Deferred Commission', 'Total Amount': 15000, 'Start Date': '2026-03-01', 'End Date': '2027-02-28', 'Recognition Method': 'Straight-Line', 'Party Name': 'John Smith', 'Payment Date': '2026-04-01', 'Commission Type': 'Initial Sale', 'Benefit Period Method': 'Contract Term', 'Deferred Commission Account': '1400 — Deferred Commissions', 'Commission Expense Account': '6300 — Commission Expense'
        }),
        createRow({
          'Contract Name': 'AWS Annual Commitment', 'Type': 'Prepaid Expenses', 'Total Amount': 60000, 'Start Date': '2026-01-01', 'End Date': '2026-12-31', 'Recognition Method': 'Straight-Line', 'Party Name': 'Amazon Web Services', 'Expense Category': 'Software/Subscriptions', 'Payment Date': '2025-12-28', 'Prepaid Account': '1310 — Prepaid Software', 'Expense Account': '6400 — Software Expense'
        })
      ];
      const csvContent = [header, ...rows].join('\n');
      newFiles.push({ file: new File([csvContent], 'Waterfall_Bulk_Data.csv', { type: 'text/csv' }) });
    } else {
      newFiles.push({ file: new File(['demo'], 'Demo_Data_Sample.csv', { type: 'text/csv' }) });
    }
    
    setFiles(newFiles);
    
    const allPossibleTargets = [
      ...(config.requiredColumns || []),
      ...(config.optionalColumns || []),
      'Class/Department',
      'Location'
    ];
    
    const uniqueCols = await processFilesForMapping(newFiles, ['Class/Department', 'Location']);
    
    if (config.requiredColumns) {
      // Automatically add 'Location' to custom columns if it's in the demo data
      if (uniqueCols.includes('Location')) {
        setCustomColumns(['Location']);
      }
    }
    setStep(2);
  };

  const parseFile = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const ext = (file.name || '').split('.').pop()?.toLowerCase();

      if (ext === 'csv') {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true,
          complete: (results) => resolve(results.data),
          error: (err) => reject(err)
        });
      } else if (ext === 'xlsx' || ext === 'xls') {
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);
            resolve(json);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
      } else {
        reject(new Error('Unsupported file format'));
      }
    });
  };

  const handleDownloadTemplate = () => {
    if (!config.requiredColumns) return;
    
    const allCols = [...config.requiredColumns, ...(config.optionalColumns || [])];
    const csvContent = allCols.join(',') + '\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', config.templateName || 'template.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleProcess = async () => {
    setIsProcessing(true);
    setValidationErrors([]);
    setShowValidationSummary(false);

    try {
      if (uploadType === 'bulk') {
        const allParsedData: any[] = [];
        const errors: ValidationError[] = [];

        for (const fileObj of files) {
          const data = await parseFile(fileObj.file);
          if (data.length === 0) {
            errors.push({
              id: `file-empty-${fileObj.file.name}`,
              row: 0,
              field: 'File',
              message: ERROR_CATALOG['UPL-003'],
              value: fileObj.file.name,
              severity: 'error',
              code: 'UPL-003',
              fileName: fileObj.file.name,
              fileRole: fileObj.role
            });
            continue;
          }

          // Basic validation per row
          const fileKey = fileObj.role || fileObj.file.name;
          const mapping = columnMapping[fileKey] || {};
          
          data.forEach((row, index) => {
            const rowNum = index + 1;
            
            // Check required columns
            config.requiredColumns?.forEach(targetCol => {
              const sourceCol = mapping[targetCol];
              const val = row[sourceCol];

              if (!sourceCol || val === undefined || val === null || String(val).trim() === '') {
                errors.push({
                  id: `file-${fileObj.file.name}-req-${rowNum}-${targetCol}`,
                  row: rowNum,
                  field: targetCol,
                  message: ERROR_CATALOG['UPL-030'],
                  value: '',
                  severity: 'error',
                  code: 'UPL-030',
                  fileName: fileObj.file.name,
                  fileRole: fileObj.role,
                  parsedDataIndex: allParsedData.length
                });
              } else if (targetCol === 'Amount' || targetCol === 'Total Amount') {
                // Validate numeric amount
                const cleanVal = String(val).replace(/[^0-9.-]+/g, "");
                if (isNaN(parseFloat(cleanVal))) {
                  errors.push({
                    id: `file-${fileObj.file.name}-num-${rowNum}-${targetCol}`,
                    row: rowNum,
                    field: targetCol,
                    message: ERROR_CATALOG['UPL-031'],
                    value: String(val),
                    severity: 'error',
                    code: 'UPL-031',
                    fileName: fileObj.file.name,
                    fileRole: fileObj.role,
                    parsedDataIndex: allParsedData.length
                  });
                }
              } else if (targetCol === 'Period/Date' || targetCol === 'Transaction Date' || targetCol === 'Start Date' || targetCol === 'End Date') {
                // Validate date/period
                const date = new Date(val);
                const isPeriod = /Q[1-4]-\d{4}/.test(String(val)) || /M\d{1,2}-\d{4}/.test(String(val));
                if (isNaN(date.getTime()) && !isPeriod) {
                  errors.push({
                    id: `file-${fileObj.file.name}-date-${rowNum}-${targetCol}`,
                    row: rowNum,
                    field: targetCol,
                    message: ERROR_CATALOG['UPL-032'],
                    value: String(val),
                    severity: 'warning',
                    code: 'UPL-032',
                    fileName: fileObj.file.name,
                    fileRole: fileObj.role,
                    parsedDataIndex: allParsedData.length
                  });
                }
              }
            });

            // Check custom columns
            customColumns.forEach(targetCol => {
              const sourceCol = mapping[targetCol];
              const val = row[sourceCol];
              if (!sourceCol || val === undefined || val === null || String(val).trim() === '') {
                errors.push({
                  id: `file-${fileObj.file.name}-custom-${rowNum}-${targetCol}`,
                  row: rowNum,
                  field: targetCol,
                  message: 'Custom attribute value is missing.',
                  value: '',
                  severity: 'warning',
                  code: 'UPL-040',
                  fileName: fileObj.file.name,
                  fileRole: fileObj.role,
                  parsedDataIndex: allParsedData.length
                });
              }
            });

            // Add role if applicable
            row._fileRole = fileObj.role;
            row._fileName = fileObj.file.name;
            if (fileObj.role) {
              row.__role = fileObj.role;
            }
            allParsedData.push(row);
          });
        }

        setParsedData(allParsedData);

        if (errors.length > 0) {
          setValidationErrors(errors);
          setShowValidationSummary(true);
          setIsProcessing(false);
          return;
        }

        // If variance dual mode, we might want to join them here or in the parent
        // For now, we pass all data back
        setShowValidationSummary(true);
      } else {
        // AI Extraction path
        const endpoint = module === 'amortization'
          ? '/api/analytics/amortization/extract'
          : '/api/analytics/waterfall/extract';

        let documentText = `Document for ${module} extraction. File: ${files[0]?.file.name}`;
        const file = files[0]?.file;
        if (file) {
          if (file.type === 'application/pdf') {
            const { parsePDF } = await import('@/lib/analytics/fileParser');
            documentText = await parsePDF(file);
          } else if (file.type.startsWith('text/') || file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
            documentText = await file.text();
          }
        }

        const token = await getCurrentAuthToken();
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: JSON.stringify({ documentText })
        });

        if (!response.ok) throw new Error('Extraction failed');
        const data = await response.json();
        
        // Handle low confidence warnings
        if (data.confidenceScores) {
          const lowConfidenceFields = Object.entries(data.confidenceScores)
            .filter(([_, score]) => (score as number) < 70)
            .map(([field, _]) => field);
            
          if (lowConfidenceFields.length > 0) {
            setValidationErrors([{
              id: 'ai-warning',
              row: 0,
              field: 'Multiple',
              message: ERROR_CATALOG['UPL-054'],
              value: lowConfidenceFields.join(', '),
              severity: 'warning',
              code: 'UPL-054'
            }]);
          }
        }

        // Store extracted data to pass on completion
        setExtractedData(data);
        setShowValidationSummary(true);
      }
    } catch (error) {
      setFileLevelError('Processing failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const [extractedData, setExtractedData] = useState<any>(null);

  const validateField = (field: string, value: string): { isValid: boolean, message?: string, code?: string } => {
    const trimmedValue = value !== undefined && value !== null ? String(value).trim() : '';
    if (trimmedValue === '') {
      return { isValid: false, message: ERROR_CATALOG['UPL-030'], code: 'UPL-030' };
    }
    if (field === 'Amount' || field === 'Total Amount') {
      const cleanVal = String(value).replace(/[^0-9.-]+/g, "");
      if (isNaN(parseFloat(cleanVal))) {
        return { isValid: false, message: ERROR_CATALOG['UPL-031'], code: 'UPL-031' };
      }
    }
    if (field === 'Period/Date' || field === 'Transaction Date' || field === 'Start Date' || field === 'End Date') {
      const date = new Date(value);
      const isPeriod = /Q[1-4]-\d{4}/.test(String(value)) || /M\d{1,2}-\d{4}/.test(String(value));
      if (isNaN(date.getTime()) && !isPeriod) {
        return { isValid: false, message: ERROR_CATALOG['UPL-032'], code: 'UPL-032' };
      }
    }
    return { isValid: true };
  };

  const handleInlineEdit = (id: string, newValue: string) => {
    setValidationErrors(prev => prev.map(err => 
      err.id === id ? { ...err, value: newValue } : err
    ));
  };

  const handleApplyFix = (id: string) => {
    setValidationErrors(prev => {
      const err = prev.find(e => e.id === id);
      if (!err) return prev;
      
      const validation = validateField(err.field, err.value);
      if (validation.isValid) {
        if (err.parsedDataIndex !== undefined) {
          setParsedData(currentData => {
            const newData = [...currentData];
            const fileKey = err.fileRole || err.fileName || '';
            const mapping = columnMapping[fileKey] || {};
            const sourceCol = mapping[err.field] || err.field;
            newData[err.parsedDataIndex!] = { ...newData[err.parsedDataIndex!], [sourceCol]: err.value };
            return newData;
          });
        }
        return prev.map(e => e.id === id ? { ...e, isFixed: true } : e);
      } else {
        alert(`Still invalid: ${validation.message}`);
        return prev.map(e => e.id === id ? { ...e, message: validation.message!, code: validation.code! } : e);
      }
    });
  };

  const handleDownloadErrorReport = () => {
    if (validationErrors.length === 0) return;
    
    const data = validationErrors.map(err => ({
      'File Name': err.fileName || '',
      'File Role': err.fileRole || '',
      'Row': err.row,
      'Field': err.field,
      'Issue Code': err.code,
      'Issue Message': err.message,
      'Current Value': err.value,
      'Status': err.isFixed ? 'Fixed' : 'Pending'
    }));
    
    const csvContent = Papa.unparse(data);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'validation_error_report.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    if (files.length <= 1) setStep(1);
  };

  const getFileIcon = (fileName: string) => {
    if (fileName.endsWith('.pdf')) return <FileText className="text-red-500" size={24} />;
    if (fileName.match(/\.(png|jpg|jpeg|webp)$/i)) return <FileImage className="text-blue-500" size={24} />;
    return <FileSpreadsheet className="text-emerald-500" size={24} />;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden max-w-5xl mx-auto">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div>
          <h3 className="text-xl font-bold text-slate-900">{config.title}</h3>
          <p className="text-sm text-slate-500">{config.description}</p>
        </div>
        {onCancel && (
          <button onClick={onCancel} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        )}
      </div>

      <div className="p-8">
        {/* Stepper */}
        <div className="flex items-center justify-center mb-10">
          {[
            { n: 1, label: 'Upload' },
            { n: 2, label: 'Validate' },
            { n: 3, label: 'Complete' }
          ].map((s, i) => (
            <React.Fragment key={s.n}>
              <div className="flex flex-col items-center gap-2">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300",
                  step >= s.n ? "bg-blue-600 text-white shadow-lg shadow-blue-200" : "bg-slate-100 text-slate-400"
                )}>
                  {step > s.n ? <CheckCircle2 size={20} /> : s.n}
                </div>
                <span className={cn(
                  "text-xs font-bold uppercase tracking-widest",
                  step >= s.n ? "text-blue-600" : "text-slate-400"
                )}>{s.label}</span>
              </div>
              {i < 2 && (
                <div className={cn(
                  "w-24 h-1 mx-4 rounded-full transition-all duration-500",
                  step > s.n ? "bg-blue-600" : "bg-slate-100"
                )} />
              )}
            </React.Fragment>
          ))}
        </div>

        {fileLevelError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
            <AlertCircle className="text-red-600 shrink-0 mt-0.5" size={18} />
            <p className="text-sm font-medium text-red-800">{fileLevelError}</p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-8">
            <div 
              className={cn(
                "border-2 border-dashed rounded-2xl p-16 text-center transition-all duration-300 group relative",
                isDragging ? "border-blue-500 bg-blue-50/50 scale-[1.01]" : "border-slate-200 hover:border-blue-400 hover:bg-slate-50/50"
              )}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300">
                <Upload size={32} />
              </div>
              <h4 className="text-xl font-bold text-slate-900 mb-2">
                Drag & drop your file{config.multiple ? 's' : ''} here
              </h4>
              <p className="text-slate-500 mb-8 max-w-sm mx-auto">
                {config.formatsText} • Max {config.maxSize / (1024 * 1024)}MB per file
              </p>
              
              <label className="bg-slate-900 text-white px-8 py-3 rounded-xl text-sm font-bold hover:bg-slate-800 transition-all cursor-pointer inline-flex items-center gap-2 shadow-lg shadow-slate-200 active:scale-95">
                Browse Files
                <input 
                  type="file" 
                  className="hidden" 
                  accept={config.accept} 
                  multiple={config.multiple}
                  onChange={handleFileSelect} 
                />
              </label>

              <div className="mt-8 flex items-center justify-center gap-4">
                <div className="h-px bg-slate-200 flex-1 max-w-[60px]"></div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">OR</span>
                <div className="h-px bg-slate-200 flex-1 max-w-[60px]"></div>
              </div>
              
              <div className="mt-6">
                <button 
                  onClick={handleDemoData}
                  className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-sm font-bold transition-colors border border-blue-100"
                >
                  <Sparkles size={16} />
                  Use Demo Data
                </button>
              </div>
            </div>

            {config.templateName && module !== 'reconciliation' && (
              <div className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-200 group hover:border-blue-200 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-blue-500 transition-colors">
                    <FileSpreadsheet size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Need a template?</p>
                    <p className="text-xs text-slate-500">Download our pre-formatted template to ensure smooth processing.</p>
                  </div>
                </div>
                <button 
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm"
                >
                  <FileDown size={16} />
                  Download Template
                </button>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-8">
            {/* File List & Role Assignment */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Selected Files</h4>
              {files.map((f, index) => (
                <div key={index} className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm group">
                  <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center">
                    {getFileIcon(f.file.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 truncate">{f.file.name}</p>
                    <p className="text-xs text-slate-500">{(f.file.size / 1024).toFixed(1)} KB</p>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => {
                        const url = URL.createObjectURL(f.file);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = f.file.name;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                      title="Download file"
                    >
                      <Download size={18} />
                    </button>

                    {config.roles && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Assign Role</span>
                        <select 
                          value={f.role}
                          onChange={(e) => {
                            const newFiles = [...files];
                            newFiles[index].role = e.target.value;
                            setFiles(newFiles);
                          }}
                          className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                          {config.roles.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    )}
                    
                    {f.file.name.match(/\.(xlsx|xls)$/i) && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Select Sheet</span>
                        <select className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500/20">
                          <option>Sheet1</option>
                          <option>Sheet2</option>
                        </select>
                      </div>
                    )}

                    <button 
                      onClick={() => removeFile(index)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
              {config.multiple && files.length < config.maxFiles && (
                <button 
                  onClick={() => setStep(1)}
                  className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm font-bold text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-all flex items-center justify-center gap-2"
                >
                  <Plus size={16} />
                  Add Another File
                </button>
              )}
            </div>

            {/* Module Specific Options */}
            {module === 'reconciliation' && (
              <div className="p-5 bg-blue-50/50 rounded-2xl border border-blue-100 space-y-4">
                <div className="flex items-center gap-2 text-blue-900">
                  <Settings size={18} />
                  <h4 className="font-bold text-sm">Reconciliation Options</h4>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">Date Format</label>
                    <select className="w-full bg-white border border-blue-200 rounded-lg px-3 py-1.5 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500/20">
                      <option>Auto-detect (YYYY-MM-DD)</option>
                      <option>MM/DD/YYYY</option>
                      <option>DD/MM/YYYY</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Column Mapping Preview */}
            {uploadType !== 'ai-extraction' && !showValidationSummary && config.requiredColumns && (
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers size={18} className="text-slate-400" />
                    <h4 className="font-bold text-slate-900 text-sm">Column Mapping</h4>
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-1 rounded-full border",
                    files.every(f => config.requiredColumns!.filter(col => !!(columnMapping[f.role || f.file.name] || {})[col]).length === config.requiredColumns!.length)
                      ? "text-emerald-700 bg-emerald-50 border-emerald-100"
                      : "text-amber-700 bg-amber-50 border-amber-100"
                  )}>
                    {files.every(f => config.requiredColumns!.filter(col => !!(columnMapping[f.role || f.file.name] || {})[col]).length === config.requiredColumns!.length) ? '✓' : '⚠️'} Auto-mapped
                  </span>
                </div>
                <div className="p-6 overflow-x-auto">
                  <div className="flex gap-4 mb-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest min-w-[600px]">
                    <div className="w-1/3 shrink-0">Target Field</div>
                    {files.map((file, i) => (
                      <div className="flex-1" key={i}>{file.role || file.file.name} Column</div>
                    ))}
                  </div>
                  <div className="space-y-3 min-w-[600px]">
                    {config.requiredColumns.map((targetCol) => {
                      return (
                        <div key={targetCol} className="flex gap-4 items-center group">
                          <div className="w-1/3 shrink-0 py-2 px-3 bg-slate-50 rounded-lg border border-slate-100 text-sm font-bold text-slate-700 group-hover:border-slate-300 transition-colors flex items-center justify-between">
                            <span>{targetCol} <span className="text-red-500 ml-1">*</span></span>
                          </div>
                          {files.map((file, i) => {
                            const fileKey = file.role || file.file.name;
                            const headers = fileHeaders[fileKey] || [];
                            const mappedSource = (columnMapping[fileKey] || {})[targetCol] || '';
                            const isMapped = !!mappedSource;
                            return (
                              <div className="flex-1" key={i}>
                                <select 
                                  value={mappedSource}
                                  onChange={(e) => setColumnMapping(prev => ({
                                    ...prev,
                                    [fileKey]: { ...(prev[fileKey] || {}), [targetCol]: e.target.value }
                                  }))}
                                  className={cn(
                                    "w-full bg-white border rounded-lg px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20",
                                    isMapped ? "border-slate-200" : "border-red-300 ring-1 ring-red-100"
                                  )}
                                >
                                  <option value="">-- Select Column --</option>
                                  {headers.map(sc => (
                                    <option key={sc} value={sc}>{sc}</option>
                                  ))}
                                </select>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                    
                    <div className="pt-4 pb-2">
                      <div className="h-px bg-slate-100 w-full"></div>
                    </div>

                    {config.optionalColumns && config.optionalColumns.length > 0 && (
                      <>
                        {config.optionalColumns.filter(col => !hiddenOptionalColumns.includes(col)).map((targetCol) => {
                          return (
                            <div key={targetCol} className="flex gap-4 items-center group mb-3">
                              <div className="w-1/3 shrink-0 py-2 px-3 bg-white rounded-lg border border-slate-200 text-sm font-medium text-slate-700 group-hover:border-blue-300 transition-colors flex items-center justify-between shadow-sm">
                                <span>{targetCol} <span className="text-[10px] uppercase tracking-wider ml-2 text-slate-400 font-bold">(Optional)</span></span>
                                <button 
                                  onClick={() => {
                                    setHiddenOptionalColumns(prev => [...prev, targetCol]);
                                    setColumnMapping(prev => {
                                      const newMapping = { ...prev };
                                      files.forEach(f => {
                                        const fileKey = f.role || f.file.name;
                                        if (newMapping[fileKey]) {
                                          const fileMap = { ...newMapping[fileKey] };
                                          delete fileMap[targetCol];
                                          newMapping[fileKey] = fileMap;
                                        }
                                      });
                                      return newMapping;
                                    });
                                  }}
                                  className="text-slate-300 hover:text-red-500 transition-colors p-1 hover:bg-red-50 rounded-md"
                                  title="Remove optional field"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                              {files.map((file, i) => {
                                const fileKey = file.role || file.file.name;
                                const headers = fileHeaders[fileKey] || [];
                                const mappedSource = (columnMapping[fileKey] || {})[targetCol] || '';
                                return (
                                  <div className="flex-1" key={i}>
                                    <select 
                                      value={mappedSource}
                                      onChange={(e) => setColumnMapping(prev => ({
                                        ...prev,
                                        [fileKey]: { ...(prev[fileKey] || {}), [targetCol]: e.target.value }
                                      }))}
                                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20"
                                    >
                                      <option value="">-- Optional --</option>
                                      {headers.map(sc => (
                                        <option key={sc} value={sc}>{sc}</option>
                                      ))}
                                    </select>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </>
                    )}

                    {customColumns.map((targetCol, idx) => {
                      return (
                        <div key={`custom-${idx}`} className="flex gap-4 items-center group mb-3">
                          <div className="w-1/3 shrink-0 py-2 px-3 bg-blue-50 rounded-lg border border-blue-100 text-sm font-bold text-blue-700 group-hover:border-blue-300 transition-colors flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <input 
                                type="text"
                                value={targetCol}
                                onChange={(e) => {
                                  const newCols = [...customColumns];
                                  const oldName = newCols[idx];
                                  newCols[idx] = e.target.value;
                                  setCustomColumns(newCols);
                                  // Update mapping key
                                  const newMapping = { ...columnMapping };
                                  files.forEach(f => {
                                    const fileKey = f.role || f.file.name;
                                    if (newMapping[fileKey] && newMapping[fileKey][oldName]) {
                                      const fileMap = { ...newMapping[fileKey] };
                                      fileMap[e.target.value] = fileMap[oldName];
                                      delete fileMap[oldName];
                                      newMapping[fileKey] = fileMap;
                                    }
                                  });
                                  setColumnMapping(newMapping);
                                }}
                                className="bg-transparent border-none focus:ring-0 p-0 w-full font-bold text-blue-700 placeholder:text-blue-300"
                                placeholder="Custom Column Name"
                              />
                            </div>
                            <button 
                              onClick={() => {
                                const newCols = customColumns.filter((_, i) => i !== idx);
                                setCustomColumns(newCols);
                                const newMapping = { ...columnMapping };
                                files.forEach(f => {
                                  const fileKey = f.role || f.file.name;
                                  if (newMapping[fileKey]) {
                                    const fileMap = { ...newMapping[fileKey] };
                                    delete fileMap[targetCol];
                                    newMapping[fileKey] = fileMap;
                                  }
                                });
                                setColumnMapping(newMapping);
                              }}
                              className="text-blue-400 hover:text-red-500"
                            >
                              <X size={14} />
                            </button>
                          </div>
                          {files.map((file, i) => {
                            const fileKey = file.role || file.file.name;
                            const headers = fileHeaders[fileKey] || [];
                            const mappedSource = (columnMapping[fileKey] || {})[targetCol] || '';
                            const isMapped = !!mappedSource;
                            return (
                              <div className="flex-1" key={i}>
                                <select 
                                  value={mappedSource}
                                  onChange={(e) => setColumnMapping(prev => ({
                                    ...prev,
                                    [fileKey]: { ...(prev[fileKey] || {}), [targetCol]: e.target.value }
                                  }))}
                                  className={cn(
                                    "w-full bg-white border rounded-lg px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20",
                                    isMapped ? "border-slate-200" : "border-blue-300 ring-1 ring-blue-100"
                                  )}
                                >
                                  <option value="">-- Select Column --</option>
                                  {headers.map(sc => (
                                    <option key={sc} value={sc}>{sc}</option>
                                  ))}
                                </select>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}

                    <button 
                      onClick={() => setCustomColumns([...customColumns, `Custom Column ${customColumns.length + 1}`])}
                      className="flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-700 py-2 px-3 rounded-lg border border-dashed border-blue-200 hover:bg-blue-50 transition-all w-fit mt-2"
                    >
                      <Plus size={14} />
                      Add Custom Attribute Column
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Validation Summary Panel */}
            {showValidationSummary && (
              <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                <div className={cn(
                  "p-6 rounded-2xl border flex items-start gap-4",
                  validationErrors.some(e => e.severity === 'error') 
                    ? "bg-red-50 border-red-200" 
                    : validationErrors.some(e => e.severity === 'warning')
                      ? "bg-amber-50 border-amber-200"
                      : "bg-emerald-50 border-emerald-200"
                )}>
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                    validationErrors.some(e => e.severity === 'error') ? "bg-red-100 text-red-600" :
                    validationErrors.some(e => e.severity === 'warning') ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"
                  )}>
                    {validationErrors.some(e => e.severity === 'error') ? <AlertCircle size={24} /> :
                     validationErrors.some(e => e.severity === 'warning') ? <AlertTriangle size={24} /> : <CheckCircle size={24} />}
                  </div>
                  <div className="flex-1">
                    <h4 className={cn(
                      "text-lg font-bold mb-1",
                      validationErrors.some(e => e.severity === 'error') ? "text-red-900" :
                      validationErrors.some(e => e.severity === 'warning') ? "text-amber-900" : "text-emerald-900"
                    )}>
                      {validationErrors.some(e => e.severity === 'error') ? "Validation Errors Detected" :
                       validationErrors.some(e => e.severity === 'warning') ? "Validation Warnings" : "Validation Passed"}
                    </h4>
                    <p className={cn(
                      "text-sm",
                      validationErrors.some(e => e.severity === 'error') ? "text-red-700" :
                      validationErrors.some(e => e.severity === 'warning') ? "text-amber-700" : "text-emerald-700"
                    )}>
                      {validationErrors.some(e => e.severity === 'error') ? `Found ${validationErrors.filter(e => e.severity === 'error').length} errors that must be fixed.` :
                       validationErrors.some(e => e.severity === 'warning') ? `Found ${validationErrors.length} potential issues to review.` : "All records are valid and ready to process."}
                    </p>
                  </div>
                  <button 
                    onClick={handleDownloadErrorReport}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 shadow-sm transition-all"
                  >
                    <Download size={16} />
                    Download Error Report
                  </button>
                </div>

                {validationErrors.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="max-h-[400px] overflow-y-auto">
                      <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold tracking-widest sticky top-0 z-10">
                          <tr>
                            <th className="px-6 py-4 border-b border-slate-200">File</th>
                            <th className="px-6 py-4 border-b border-slate-200">Row</th>
                            <th className="px-6 py-4 border-b border-slate-200">Field</th>
                            <th className="px-6 py-4 border-b border-slate-200">Issue</th>
                            <th className="px-6 py-4 border-b border-slate-200">Current Value</th>
                            <th className="px-6 py-4 border-b border-slate-200">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {validationErrors.map((err) => (
                            <tr key={err.id} className={cn(
                              "group transition-colors",
                              err.severity === 'error' ? 'hover:bg-red-50/30' : 'hover:bg-amber-50/30'
                            )}>
                              <td className="px-6 py-4 text-xs text-slate-500 max-w-[150px] truncate" title={err.fileName}>
                                {err.fileRole ? <span className="font-bold text-slate-700 mr-1">[{err.fileRole}]</span> : null}
                                {err.fileName || 'Unknown File'}
                              </td>
                              <td className="px-6 py-4 font-mono text-xs text-slate-500">{err.row}</td>
                              <td className="px-6 py-4 font-bold text-slate-900">{err.field}</td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-0.5">
                                  <span className={cn(
                                    "text-[10px] font-bold uppercase",
                                    err.severity === 'error' ? "text-red-500" : "text-amber-500"
                                  )}>{err.code}</span>
                                  <span className="text-slate-600">{err.message}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="relative">
                                  <input 
                                    type="text" 
                                    value={err.value}
                                    onChange={(e) => handleInlineEdit(err.id, e.target.value)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                                  />
                                  <Edit3 size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <button 
                                  onClick={() => handleApplyFix(err.id)}
                                  disabled={err.isFixed}
                                  className={cn(
                                    "font-bold text-xs transition-colors",
                                    err.isFixed 
                                      ? "text-emerald-600 cursor-default" 
                                      : "text-blue-600 hover:underline"
                                  )}
                                >
                                  {err.isFixed ? 'Applied ✓' : 'Apply Fix'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between items-center pt-6 border-t border-slate-100">
              <button 
                onClick={() => setStep(1)} 
                className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-all flex items-center gap-2"
              >
                <X size={18} />
                Cancel
              </button>
              
              <div className="flex gap-4">
                {showValidationSummary && !validationErrors.some(e => e.severity === 'error') ? (
                  <button 
                    onClick={() => setStep(3)}
                    className="flex items-center gap-2 bg-blue-600 text-white px-10 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95"
                  >
                    Confirm & Process
                    <ChevronRight size={18} />
                  </button>
                ) : showValidationSummary && validationErrors.some(e => e.severity === 'error') ? (
                  <button 
                    onClick={() => {
                      setIsProcessing(true);
                      setTimeout(() => {
                        setIsProcessing(false);
                        setValidationErrors(prev => {
                          const newErrors = [...prev];
                          const validErrors: ValidationError[] = [];
                          
                          const remainingErrors = newErrors.map(err => {
                            if (err.isFixed) return null;
                            const validation = validateField(err.field, err.value);
                            if (validation.isValid) {
                              validErrors.push(err);
                              return null;
                            }
                            return { ...err, message: validation.message!, code: validation.code! };
                          }).filter(Boolean) as ValidationError[];
                          
                          if (validErrors.length > 0) {
                            setParsedData(currentData => {
                              const newData = [...currentData];
                              validErrors.forEach(err => {
                                if (err.parsedDataIndex !== undefined) {
                                  const fileKey = err.fileRole || err.fileName || '';
                                  const mapping = columnMapping[fileKey] || {};
                                  const sourceCol = mapping[err.field] || err.field;
                                  newData[err.parsedDataIndex!] = { ...newData[err.parsedDataIndex!], [sourceCol]: err.value };
                                }
                              });
                              return newData;
                            });
                          }
                          
                          return remainingErrors;
                        });
                      }, 1000);
                    }}
                    className="flex items-center gap-2 bg-slate-900 text-white px-10 py-3 rounded-xl font-bold hover:bg-slate-800 shadow-lg shadow-slate-200 transition-all active:scale-95"
                  >
                    <RefreshCw size={18} className={isProcessing ? "animate-spin" : ""} />
                    {isProcessing ? 'Validating...' : 'Re-validate Records'}
                  </button>
                ) : (
                  <button 
                    onClick={handleProcess}
                    disabled={isProcessing || files.length === 0 || (uploadType !== 'ai-extraction' && config.requiredColumns && !files.every(f => config.requiredColumns!.filter(col => !!(columnMapping[f.role || f.file.name] || {})[col]).length === config.requiredColumns!.length))}
                    className="flex items-center gap-2 bg-blue-600 text-white px-10 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all disabled:opacity-50 active:scale-95"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        {uploadType === 'ai-extraction' ? 'Start AI Extraction' : 'Process & Validate'}
                        <ChevronRight size={18} />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="text-center py-16 animate-in zoom-in-95 duration-500">
            <div className="w-24 h-24 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner relative">
              <CheckCircle2 size={48} />
              <div className="absolute inset-0 rounded-full border-4 border-emerald-100 animate-ping opacity-20" />
            </div>
            <h4 className="text-3xl font-black text-slate-900 mb-4">
              {uploadType === 'ai-extraction' ? 'Extraction Complete' : 'Upload Successful'}
            </h4>
            <p className="text-slate-500 mb-12 max-w-md mx-auto text-lg leading-relaxed">
              {uploadType === 'ai-extraction' 
                ? 'Our AI engine has successfully extracted structured data from your document. Please review the results.' 
                : 'Your data has been successfully validated, mapped, and processed into the system.'}
            </p>
            <div className="flex flex-col items-center gap-4">
              <button 
                onClick={() => onComplete?.(uploadType === 'ai-extraction' ? extractedData : { sourceColumns, columnMapping, customColumns, rawData: parsedData })}
                className="bg-blue-600 text-white px-12 py-4 rounded-2xl font-black text-lg hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all active:scale-95 flex items-center gap-3"
              >
                View Results
                <ChevronRight size={20} />
              </button>
              <button 
                onClick={() => {
                  const summaryData = [
                    { Metric: 'Total Files Processed', Value: files.length },
                    { Metric: 'Total Rows Processed', Value: parsedData.length },
                    { Metric: 'Validation Errors Found', Value: validationErrors.length },
                    { Metric: 'Validation Errors Fixed', Value: validationErrors.filter(e => e.isFixed).length },
                    { Metric: 'Status', Value: 'Success' }
                  ];
                  const csvContent = Papa.unparse(summaryData);
                  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.setAttribute('href', url);
                  link.setAttribute('download', 'processing_summary.csv');
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="text-slate-400 font-bold text-sm hover:text-slate-600 transition-colors"
              >
                Download Processing Summary
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
