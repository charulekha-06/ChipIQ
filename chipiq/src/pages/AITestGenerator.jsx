import React, { useState, useRef, useEffect } from 'react';
import { HiOutlineSparkles, HiOutlineClipboardCopy, HiCheck, HiPaperAirplane } from 'react-icons/hi';
import './AITestGenerator.css';

const MOCK_SYSTEM_VERILOG = `\`include "uvm_macros.svh"
import uvm_pkg::*;

// Auto-Generated AXI4 Master BFM Testbench
class axi4_master_bfm extends uvm_driver #(axi_seq_item);
  \`uvm_component_utils(axi4_master_bfm)
  
  virtual axi_if vif;
  
  function new(string name, uvm_component parent);
    super.new(name, parent);
  endfunction
  
  function void build_phase(uvm_phase phase);
    super.build_phase(phase);
    if (!uvm_config_db#(virtual axi_if)::get(this, "", "vif", vif)) begin
      \`uvm_fatal("NO_VIF", "Virtual interface not found for AXI Master")
    end
  endfunction
  
  task run_phase(uvm_phase phase);
    forever begin
      seq_item_port.get_next_item(req);
      drive_transfer(req);
      seq_item_port.item_done();
    end
  endtask
  
  task drive_transfer(axi_seq_item req);
    // Wait for AWREADY
    @(posedge vif.clk);
    while (vif.awready !== 1'b1) @(posedge vif.clk);
    
    // Drive Address Phase
    vif.awvalid <= 1'b1;
    vif.awaddr  <= req.addr;
    vif.awburst <= req.burst_type;
    vif.awlen   <= req.len;
    
    // ... Additional driving logic generated ...
  endtask
endclass
`;

export default function AITestGenerator() {
  const [prompt, setPrompt] = useState('');
  const [chatLog, setChatLog] = useState([
    { role: 'ai', type: 'greeting', content: 'Hello! I am ChipIQ\'s AI. Describe the verification component or testbench you need, and I will generate the SystemVerilog/UVM code for you.' }
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);
  
  const chatEndRef = useRef(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog]);

  const handleGenerate = () => {
    if (!prompt.trim()) return;

    // 1. Add User Message
    const userMessage = { role: 'user', content: prompt };
    setChatLog(prev => [...prev, userMessage]);
    setPrompt('');
    setIsGenerating(true);

    // 2. Add AI Loading State
    const placeholderIndex = chatLog.length + 1;
    setChatLog(prev => [...prev, { role: 'ai', type: 'loading' }]);

    // 3. Simulate processing time
    setTimeout(() => {
      // 4. Transform Loading to Streaming Code
      setChatLog(prev => {
        const newLog = [...prev];
        newLog[placeholderIndex] = { role: 'ai', type: 'code', content: '' };
        return newLog;
      });

      // 5. Typewriter effect for code
      let i = 0;
      const characters = MOCK_SYSTEM_VERILOG.split('');
      
      const streamInterval = setInterval(() => {
        if (i < characters.length) {
          const char = characters[i];
          setChatLog(prev => {
            const newLog = [...prev];
            newLog[placeholderIndex].content += char;
            return newLog;
          });
          i++;
        } else {
          clearInterval(streamInterval);
          setIsGenerating(false);
        }
      }, 5); // 5ms per character for fast streaming

    }, 1200); // 1.2s "thinking" delay
  };

  const handleCopy = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className="ai-container">
      <div className="ai-header">
        <h1 className="ai-title"><HiOutlineSparkles color="#D32F2F" /> AI Test Generator</h1>
        <p className="ai-subtitle">Transform natural language into production-ready SystemVerilog & UVM testbenches.</p>
      </div>

      <div className="ai-chat-area">
        {chatLog.map((log, index) => (
          <div key={index} className={`chat-message ${log.role}`}>
            {log.role === 'ai' && (
              <div className="ai-avatar-row">
                <HiOutlineSparkles size={18} />
                <span>ChipIQ AI</span>
              </div>
            )}
            
            {log.type === 'greeting' && (
              <div style={{ color: '#111111', lineHeight: 1.5 }}>{log.content}</div>
            )}

            {log.type === 'loading' && (
              <div className="typing-indicator">
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
                <div className="typing-dot"></div>
              </div>
            )}

            {log.type === 'code' && (
              <div className="code-container">
                <div className="code-header">
                  <span>SystemVerilog (UVM)</span>
                  <button className="copy-btn" onClick={() => handleCopy(log.content, index)}>
                    {copiedIndex === index ? <HiCheck color="#111111" size={16} /> : <HiOutlineClipboardCopy size={16} />}
                    {copiedIndex === index ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>
                <pre className="code-block">
                  <code>{log.content}</code>
                </pre>
              </div>
            )}

            {log.role === 'user' && (
              <div>{log.content}</div>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      <div className="ai-input-area">
        <textarea
          className="ai-prompt-input"
          placeholder="e.g., Generate a UVM sequence pushing 16 bursts to an AXI-lite master..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isGenerating}
          rows={1}
        />
        <button 
          className="generate-btn" 
          onClick={handleGenerate} 
          disabled={!prompt.trim() || isGenerating}
          title="Generate Testbench"
        >
          <HiPaperAirplane style={{ transform: 'rotate(90deg)' }} size={20} />
        </button>
      </div>
    </div>
  );
}
