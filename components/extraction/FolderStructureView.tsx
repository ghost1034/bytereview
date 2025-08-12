'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Folder, FileText } from 'lucide-react'

interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: { [key: string]: FileNode }
  size?: number
}

interface FolderStructureViewProps {
  files: Array<{
    filename: string
    original_path?: string
    size_bytes: number
    source_zip?: string
  }>
  className?: string
  onFileSelect?: (filename: string) => void
  selectedFile?: string
}

export default function FolderStructureView({ files, className = '', onFileSelect, selectedFile }: FolderStructureViewProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  // Build folder tree structure
  const buildFolderTree = (): FileNode[] => {
    const root: { [key: string]: FileNode } = {}

    files.forEach(file => {
      const path = file.original_path || file.filename
      const parts = path.split('/').filter(part => part.length > 0)
      
      let current = root
      let currentPath = ''

      // Build the path
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        currentPath = currentPath ? `${currentPath}/${part}` : part
        
        if (!current[part]) {
          current[part] = {
            name: part,
            path: currentPath,
            isDirectory: i < parts.length - 1,
            children: i < parts.length - 1 ? {} : undefined,
            size: i === parts.length - 1 ? file.size_bytes : undefined
          }
        }
        
        if (i < parts.length - 1) {
          current = current[part].children as { [key: string]: FileNode }
        }
      }
    })

    // Convert to array, preserving insertion order from backend-provided file list
    const convertToArray = (obj: { [key: string]: FileNode }): FileNode[] => {
      return Object.values(obj).map(node => ({
        ...node,
        children: node.children
      }))
    }

    return convertToArray(root)
  }

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedFolders(newExpanded)
  }

  const renderNode = (node: FileNode, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(node.path)
    const isSelected = !node.isDirectory && selectedFile === node.name
    const paddingLeft = depth * 20

    return (
      <div key={node.path}>
        <div 
          className={`flex items-center py-1 rounded cursor-pointer transition-colors ${
            isSelected 
              ? 'bg-blue-50 border border-blue-200' 
              : 'hover:bg-gray-50'
          }`}
          style={{ paddingLeft: `${paddingLeft}px` }}
          onClick={() => {
            if (node.isDirectory) {
              toggleFolder(node.path)
            } else if (onFileSelect) {
              onFileSelect(node.name)
            }
          }}
        >
          {node.isDirectory ? (
            <>
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 mr-1 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 mr-1 text-gray-500" />
              )}
              <Folder className="w-4 h-4 mr-2 text-blue-500" />
              <span className="text-sm font-medium text-gray-700">{node.name}</span>
              {node.children && (
                <span className="ml-2 text-xs text-gray-500">
                  ({Object.keys(node.children).length} items)
                </span>
              )}
            </>
          ) : (
            <>
              <div className="w-4 h-4 mr-1" /> {/* Spacer for alignment */}
              <FileText className={`w-4 h-4 mr-2 ${isSelected ? 'text-blue-600' : 'text-red-500'}`} />
              <span className={`text-sm ${isSelected ? 'text-blue-900 font-medium' : 'text-gray-600'}`}>{node.name}</span>
              {node.size && (
                <span className={`ml-auto text-xs ${isSelected ? 'text-blue-600' : 'text-gray-400'}`}>
                  {(node.size / 1024 / 1024).toFixed(2)} MB
                </span>
              )}
            </>
          )}
        </div>
        
        {node.isDirectory && isExpanded && node.children && (
          <div>
            {Object.values(node.children).map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const folderTree = buildFolderTree()

  if (folderTree.length === 0) {
    return null
  }

  return (
    <div className={className}>
      <div className="max-h-64 overflow-y-auto">
        {folderTree.map(node => renderNode(node))}
      </div>
    </div>
  )
}