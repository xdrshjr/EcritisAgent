"""
Document Tools for Agent
Provides tools for searching and modifying document content
"""

import logging
from typing import Dict, Any, List, Optional


logger = logging.getLogger(__name__)


class DocumentTools:
    """
    Tools for document manipulation
    Provides search and modify capabilities for the agent
    """
    
    def __init__(self, initial_content: str = ""):
        """
        Initialize document tools
        
        Args:
            initial_content: Initial document content
        """
        self.document_content = initial_content
        logger.info('DocumentTools initialized', extra={
            'content_length': len(initial_content),
        })
    
    @staticmethod
    def get_tool_descriptions() -> str:
        """
        Get descriptions of available tools for the agent
        
        Returns:
            Formatted string describing all available tools
        """
        return """Available Tools:

1. search_document_text(query: str) -> Dict
   - Description: Search for text in the document using a query string
   - Input: query (string) - Text to search for
   - Output: {
       "found": boolean,
       "matches": [
           {
               "text": "matched text with context",
               "position": position_in_document,
               "context_before": "text before match",
               "context_after": "text after match"
           }
       ]
     }
   - Use this to find specific text that needs to be modified

2. modify_document_text(original_text: str, modified_text: str) -> Dict
   - Description: Replace original text with modified text in the document
   - Input:
     * original_text (string) - Exact text to find and replace
     * modified_text (string) - New text to replace with
   - Output: {
       "success": boolean,
       "modifications_count": number,
       "message": "description of what was changed",
       "updated_content": "full updated document content"
     }
   - Use this to make actual changes to the document
   - The left panel will update automatically after successful modification

3. get_document_content() -> Dict
   - Description: Get the current full document content
   - Input: None
   - Output: {
       "content": "full document text",
       "length": number_of_characters
     }
   - Use this to review the complete document before planning changes
"""
    
    def search_document_text(self, query: str) -> Dict[str, Any]:
        """
        Search for text in the document
        
        Args:
            query: Text to search for
            
        Returns:
            Dictionary with search results
        """
        logger.info('[TOOL] search_document_text called', extra={
            'tool': 'search_document_text',
            'query_preview': query[:50] + '...' if len(query) > 50 else query,
            'query_length': len(query),
            'document_length': len(self.document_content),
        })
        
        if not query:
            logger.warning('[TOOL] Empty search query provided')
            result = {
                "found": False,
                "matches": [],
                "message": "Search query cannot be empty"
            }
            logger.debug('[TOOL] search_document_text result', extra={'result': result})
            return result
        
        matches = []
        content_lower = self.document_content.lower()
        query_lower = query.lower()
        
        # Find all occurrences
        start = 0
        while True:
            pos = content_lower.find(query_lower, start)
            if pos == -1:
                break
            
            # Extract context (100 chars before and after)
            context_start = max(0, pos - 100)
            context_end = min(len(self.document_content), pos + len(query) + 100)
            
            context_before = self.document_content[context_start:pos]
            matched_text = self.document_content[pos:pos + len(query)]
            context_after = self.document_content[pos + len(query):context_end]
            
            matches.append({
                "text": matched_text,
                "position": pos,
                "context_before": context_before,
                "context_after": context_after,
                "full_context": context_before + matched_text + context_after
            })
            
            start = pos + 1
        
        result = {
            "found": len(matches) > 0,
            "matches": matches,
            "total_matches": len(matches),
            "message": f"Found {len(matches)} occurrence(s) of the search query"
        }
        
        logger.info('[TOOL] search_document_text completed', extra={
            'found': result['found'],
            'matches_count': result['total_matches'],
            'first_match_position': matches[0]['position'] if matches else None,
        })
        logger.debug('[TOOL] search_document_text detailed result', extra={
            'result': str(result)[:500],
        })
        
        return result
    
    def modify_document_text(self, original_text: str, modified_text: str) -> Dict[str, Any]:
        """
        Modify document text by replacing original with modified
        Supports exact matching and fuzzy matching with detailed error reporting
        
        Args:
            original_text: Text to find and replace
            modified_text: Replacement text
            
        Returns:
            Dictionary with modification results
        """
        logger.info('[TOOL] modify_document_text called', extra={
            'tool': 'modify_document_text',
            'original_length': len(original_text),
            'modified_length': len(modified_text),
            'original_preview': original_text[:80] + '...' if len(original_text) > 80 else original_text,
            'modified_preview': modified_text[:80] + '...' if len(modified_text) > 80 else modified_text,
            'document_length_before': len(self.document_content),
        })
        
        if not original_text:
            logger.warning('[TOOL] Empty original text provided')
            result = {
                "success": False,
                "modifications_count": 0,
                "message": "Original text cannot be empty",
                "updated_content": self.document_content
            }
            logger.debug('[TOOL] modify_document_text result', extra={'result': result})
            return result
        
        # Try exact match first (case-sensitive)
        count = self.document_content.count(original_text)
        
        if count > 0:
            logger.info('[TOOL] Found exact matches', extra={
                'match_count': count,
                'match_type': 'exact',
            })
            # Perform exact replacement
            updated_content = self.document_content.replace(original_text, modified_text)
            previous_length = len(self.document_content)
            self.document_content = updated_content
            
            result = {
                "success": True,
                "modifications_count": count,
                "message": f"Successfully replaced {count} occurrence(s) of the text (exact match)",
                "updated_content": updated_content
            }
            
            logger.info('[TOOL] modify_document_text completed successfully', extra={
                'modifications_count': count,
                'match_type': 'exact',
                'document_length_before': previous_length,
                'document_length_after': len(updated_content),
                'length_diff': len(updated_content) - previous_length,
            })
            logger.debug('[TOOL] modify_document_text detailed result', extra={
                'result': str(result)[:500],
            })
            
            return result
        
        # Try case-insensitive match
        logger.debug('[TOOL] Attempting case-insensitive match', extra={
            'original_text_preview': original_text[:100],
        })
        
        content_lower = self.document_content.lower()
        original_lower = original_text.lower()
        case_insensitive_pos = content_lower.find(original_lower)
        
        if case_insensitive_pos != -1:
            logger.info('[TOOL] Found case-insensitive match', extra={
                'position': case_insensitive_pos,
                'match_type': 'case_insensitive',
            })
            
            # Extract actual text from document (preserves original case)
            actual_text = self.document_content[case_insensitive_pos:case_insensitive_pos + len(original_text)]
            
            # Replace all case-insensitive occurrences
            # Build new content by finding and replacing each occurrence
            updated_content = self.document_content
            replacements_made = 0
            start_pos = 0
            
            while True:
                pos = updated_content.lower().find(original_lower, start_pos)
                if pos == -1:
                    break
                # Extract the actual text at this position
                actual = updated_content[pos:pos + len(original_text)]
                # Replace this occurrence
                updated_content = updated_content[:pos] + modified_text + updated_content[pos + len(original_text):]
                replacements_made += 1
                start_pos = pos + len(modified_text)
            
            previous_length = len(self.document_content)
            self.document_content = updated_content
            
            result = {
                "success": True,
                "modifications_count": replacements_made,
                "message": f"Successfully replaced {replacements_made} occurrence(s) of the text (case-insensitive match). Original text had different case.",
                "updated_content": updated_content,
                "note": f"Matched '{actual_text}' with different case"
            }
            
            logger.info('[TOOL] modify_document_text completed with case-insensitive match', extra={
                'modifications_count': replacements_made,
                'match_type': 'case_insensitive',
                'original_case': actual_text[:50],
                'document_length_before': previous_length,
                'document_length_after': len(updated_content),
                'length_diff': len(updated_content) - previous_length,
            })
            logger.debug('[TOOL] modify_document_text detailed result', extra={
                'result': str(result)[:500],
            })
            
            return result
        
        # No match found - provide detailed error with suggestions
        logger.warning('[TOOL] Original text not found in document (tried exact and case-insensitive)', extra={
            'original_text': original_text[:200],
            'document_length': len(self.document_content),
        })
        
        # Try to find similar text for better error message
        suggestion = self._find_similar_text(original_text)
        error_message = "Original text not found in document. "
        
        if suggestion:
            error_message += f"Did you mean: '{suggestion}'? "
            logger.info('[TOOL] Found similar text suggestion', extra={
                'suggestion': suggestion[:100],
            })
        
        error_message += "Please use search_document_text first to get the exact text, or use get_document_content to see the full document."
        
        result = {
            "success": False,
            "modifications_count": 0,
            "message": error_message,
            "updated_content": self.document_content,
            "suggestion": suggestion if suggestion else None
        }
        
        logger.debug('[TOOL] modify_document_text result', extra={'result': str(result)[:500]})
        return result
    
    def _find_similar_text(self, search_text: str, max_distance: int = 5) -> Optional[str]:
        """
        Find similar text in document for helpful error messages
        
        Args:
            search_text: Text to find similar matches for
            max_distance: Maximum edit distance for suggestions
            
        Returns:
            Similar text if found, None otherwise
        """
        if len(search_text) < 5:
            return None
        
        # Try finding partial matches (first few words)
        words = search_text.split()
        if len(words) > 2:
            first_words = ' '.join(words[:2])
            if first_words.lower() in self.document_content.lower():
                # Find the actual occurrence
                pos = self.document_content.lower().find(first_words.lower())
                if pos != -1:
                    # Extract context
                    end_pos = min(pos + len(search_text) + 20, len(self.document_content))
                    similar = self.document_content[pos:end_pos].strip()
                    logger.debug('[TOOL] Found partial match for suggestion', extra={
                        'search_text': search_text[:50],
                        'similar_text': similar[:50],
                    })
                    return similar
        
        return None
    
    def get_document_content(self) -> Dict[str, Any]:
        """
        Get current document content
        
        Returns:
            Dictionary with document content
        """
        logger.info('[TOOL] get_document_content called', extra={
            'tool': 'get_document_content',
            'content_length': len(self.document_content),
        })
        
        result = {
            "content": self.document_content,
            "length": len(self.document_content),
            "message": f"Document contains {len(self.document_content)} characters"
        }
        
        logger.debug('[TOOL] get_document_content result', extra={
            'length': result['length'],
            'content_preview': self.document_content[:200] + '...' if len(self.document_content) > 200 else self.document_content,
        })
        
        return result
    
    def execute_tool(self, tool_name: str, **kwargs) -> Dict[str, Any]:
        """
        Execute a tool by name
        
        Args:
            tool_name: Name of the tool to execute
            **kwargs: Tool arguments
            
        Returns:
            Tool execution result
        """
        logger.info('[TOOL] Executing tool', extra={
            'tool_name': tool_name,
            'tool_args_keys': list(kwargs.keys()),
            'tool_args_preview': str(kwargs)[:200] + '...' if len(str(kwargs)) > 200 else str(kwargs),
        })
        
        try:
            if tool_name == "search_document_text":
                result = self.search_document_text(kwargs.get("query", ""))
            elif tool_name == "modify_document_text":
                result = self.modify_document_text(
                    kwargs.get("original_text", ""),
                    kwargs.get("modified_text", "")
                )
            elif tool_name == "get_document_content":
                result = self.get_document_content()
            else:
                logger.error('[TOOL] Unknown tool requested', extra={'tool_name': tool_name})
                result = {
                    "success": False,
                    "message": f"Unknown tool: {tool_name}"
                }
            
            logger.info('[TOOL] Tool execution completed', extra={
                'tool_name': tool_name,
                'success': result.get('success', result.get('found', True)),
                'result_message': result.get('message', '')[:100],
            })
            
            return result
            
        except Exception as e:
            logger.error('[TOOL] Tool execution failed', extra={
                'tool_name': tool_name,
                'error': str(e),
                'error_type': type(e).__name__,
            }, exc_info=True)
            return {
                "success": False,
                "message": f"Tool execution error: {str(e)}",
                "error": str(e)
            }

