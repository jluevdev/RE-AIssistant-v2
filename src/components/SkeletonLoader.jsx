import React from 'react'

const SkeletonLoader = ({ 
  type = 'card', 
  lines = 3, 
  className = '',
  height = 'auto',
  width = 'auto'
}) => {
  const renderSkeleton = () => {
    switch (type) {
      case 'card':
        return (
          <div className={`bg-white rounded-lg shadow-sm border p-4 sm:p-6 ${className}`}>
            <div className="animate-pulse">
              <div className="flex items-center mb-4">
                <div className="w-10 h-10 bg-gray-200 rounded-full mr-3"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
              <div className="space-y-3">
                {Array.from({ length: lines }).map((_, index) => (
                  <div key={index} className="h-3 bg-gray-200 rounded" style={{ width: `${Math.random() * 40 + 60}%` }}></div>
                ))}
              </div>
            </div>
          </div>
        )
      
      case 'text':
        return (
          <div className={`animate-pulse ${className}`}>
            <div className="space-y-2">
              {Array.from({ length: lines }).map((_, index) => (
                <div key={index} className="h-4 bg-gray-200 rounded" style={{ width: `${Math.random() * 30 + 70}%` }}></div>
              ))}
            </div>
          </div>
        )
      
      case 'avatar':
        return (
          <div className={`animate-pulse ${className}`}>
            <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
          </div>
        )
      
      case 'button':
        return (
          <div className={`animate-pulse ${className}`}>
            <div className="h-10 bg-gray-200 rounded-lg w-24"></div>
          </div>
        )
      
      case 'input':
        return (
          <div className={`animate-pulse ${className}`}>
            <div className="h-10 bg-gray-200 rounded-lg w-full"></div>
          </div>
        )
      
      case 'table':
        return (
          <div className={`animate-pulse ${className}`}>
            <div className="space-y-3">
              {Array.from({ length: lines }).map((_, index) => (
                <div key={index} className="flex space-x-4">
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/6"></div>
                </div>
              ))}
            </div>
          </div>
        )
      
      case 'stats':
        return (
          <div className={`bg-white rounded-lg shadow-sm border p-4 sm:p-6 ${className}`}>
            <div className="animate-pulse">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-gray-200 rounded mr-3"></div>
                <div className="flex-1">
                  <div className="h-3 bg-gray-200 rounded w-20 mb-2"></div>
                  <div className="h-6 bg-gray-200 rounded w-16"></div>
                </div>
              </div>
            </div>
          </div>
        )
      
      default:
        return (
          <div className={`animate-pulse ${className}`}>
            <div className="h-4 bg-gray-200 rounded w-full"></div>
          </div>
        )
    }
  }

  return renderSkeleton()
}

export default SkeletonLoader 