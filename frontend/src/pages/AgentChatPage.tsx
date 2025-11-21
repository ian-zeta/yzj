import React, { useState, useRef, useEffect } from 'react';
import {
  Card,
  Input,
  Button,
  Avatar,
  Space,
  Typography,
  Divider,
  Tag,
  Select,
  Row,
  Col,
  List,
  Badge,
  Tooltip,
  Modal,
  Form,
  Switch,
  message,
  Progress,
  Alert,
  Tabs,
} from 'antd';
import {
  SendOutlined,
  RobotOutlined,
  UserOutlined,
  ClearOutlined,
  SettingOutlined,
  BulbOutlined,
  ThunderboltOutlined,
  UploadOutlined,
  PlayCircleOutlined,
  FileImageOutlined,
  FileTextOutlined as FileTextIcon,
  VideoCameraOutlined,
  AudioOutlined,
} from '@ant-design/icons';
import styled, { ThemeProvider } from 'styled-components';
import { DefaultTheme } from 'styled-components';
import { modelAPI, chatAPI } from '../services/api';

const { TextArea } = Input;
const { Text, Title } = Typography;
const { Option } = Select;

interface Message {
  id: string;
  type: 'user' | 'agent';
  content: string;
  timestamp: string;
  status?: 'sending' | 'sent' | 'error';
}

interface AgentModel {
  id: string;
  name: string;
  description: string;
  type: 'general' | 'code' | 'analysis' | 'management';
  status: 'online' | 'offline' | 'busy';
  capabilities: string[];
}

interface InferenceTask {
  id: string;
  fileName: string;
  fileType: 'image' | 'text' | 'video' | 'audio';
  model: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result?: string;
  startTime: string;
  endTime?: string;
}

interface ServiceCommand {
  command: string;
  description: string;
  examples: string[];
  category: 'service' | 'monitor' | 'analysis' | 'system';
}

// 流式响应chunk的类型定义
interface StreamChunk {
  token?: string;
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
  content?: string;
  text?: string;
}

const AgentChatPage: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'agent',
      content: '您好！我是智能训练助手，可以帮助您管理模型训练、监控资源状态、分析性能数据等。请问有什么可以为您服务的吗？',
      timestamp: new Date().toLocaleTimeString(),
      status: 'sent',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('qwen-assistant');
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isUploadModalVisible, setIsUploadModalVisible] = useState(false);
  const [isCommandModalVisible, setIsCommandModalVisible] = useState(false);
  const [inferenceTasks, setInferenceTasks] = useState<InferenceTask[]>([]);
  const [uploadForm] = Form.useForm();
  const [commandForm] = Form.useForm();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [settingsForm] = Form.useForm();
  
  // 新增状态管理
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [currentModel, setCurrentModel] = useState<any>(null);
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');

  // 可用的Agent模型
  const agentModels: AgentModel[] = [
    {
      id: 'qwen-assistant',
      name: 'Qwen训练助手',
      description: '基于Qwen大模型的智能训练助手，擅长模型训练指导和问题解答',
      type: 'general',
      status: 'online',
      capabilities: ['模型训练指导', '参数调优建议', '错误诊断', '性能分析'],
    },
    {
      id: 'code-expert',
      name: '代码专家',
      description: '专门处理代码相关问题的AI助手',
      type: 'code',
      status: 'online',
      capabilities: ['代码审查', '调试建议', '优化推荐', '架构设计'],
    },
    {
      id: 'resource-monitor',
      name: '资源监控Agent',
      description: '专注于系统资源监控和性能分析',
      type: 'analysis',
      status: 'online',
      capabilities: ['资源监控', '性能分析', '告警处理', '优化建议'],
    },
    {
      id: 'training-manager',
      name: '训练管理员',
      description: '专门管理训练任务和流程的智能助手',
      type: 'management',
      status: 'busy',
      capabilities: ['任务调度', '流程管理', '进度跟踪', '结果分析'],
    },
  ];

  // 快捷问题模板
  const quickQuestions = [
    {
      category: '资源监控',
      icon: <ThunderboltOutlined />,
      questions: [
        '当前GPU使用情况如何？',
        '存储空间还剩多少？',
        '系统负载是否正常？',
        '有哪些异常告警？',
      ],
    },
    {
      category: '服务管理',
      icon: <PlayCircleOutlined />,
      questions: [
        '启动Qwen-7B服务',
        '停止ResNet-50服务',
        '查看所有运行中服务',
        '重启系统监控服务',
      ],
    },
    {
      category: '智能推理',
      icon: <FileImageOutlined />,
      questions: [
        '上传图片进行物体识别',
        '分析文本情感倾向',
        '视频序列行为分析',
        '音频语音识别',
      ],
    },
    {
      category: '问题排查',
      icon: <BulbOutlined />,
      questions: [
        'GPU内存不足怎么办？',
        '训练速度太慢的原因？',
        '如何优化数据加载？',
        '模型精度不佳的解决方案？',
      ],
    },
  ];

  // 支持的服务指令
  const serviceCommands: ServiceCommand[] = [
    {
      command: '启动服务',
      description: '启动指定的模型服务',
      examples: ['启动Qwen-7B服务', '启动ResNet-50图像识别服务'],
      category: 'service',
    },
    {
      command: '停止服务',
      description: '停止指定的模型服务',
      examples: ['停止SERVICE-001', '停止所有图像识别服务'],
      category: 'service',
    },
    {
      command: '查看状态',
      description: '查看系统资源和服务状态',
      examples: ['查看GPU状态', '查看存储使用情况', '查看服务健康状态'],
      category: 'monitor',
    },
    {
      command: '系统优化',
      description: '执行系统优化操作',
      examples: ['清理临时文件', '优化GPU内存分配', '重启网络服务'],
      category: 'system',
    },
  ];

  const scrollToBottom = () => {
    const container = document.querySelector('.messages-container');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  // 初始化函数
  useEffect(() => {
    initializeData();
  }, []);

  const initializeData = async () => {
    try {
      console.log('开始初始化数据...');
      
      // 加载模型列表
      console.log('正在加载模型列表...');
      const models = await modelAPI.getModels();
      console.log('模型列表:', models);
      setAvailableModels(models);
      
      // 获取当前模型
      try {
        console.log('正在获取当前模型...');
        const current = await modelAPI.getCurrentModel();
        console.log('当前模型:', current);
        setCurrentModel(current);
      } catch (error) {
        console.log('当前没有加载的模型:', error);
      }
      
      // 健康检查
      console.log('正在进行健康检查...');
      const health = await modelAPI.getHealth();
      console.log('健康状态:', health);
      setHealthStatus(health);
      
      console.log('数据初始化完成');
    } catch (error) {
      console.error('初始化数据失败:', error);
      message.error(`连接后端服务失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date().toLocaleTimeString(),
      status: 'sent',
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = inputValue;
    setInputValue('');
    setIsLoading(true);

    try {
    // 构建消息历史
    const messageHistory = [
      ...messages.map(msg => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content
      })),
      { role: 'user', content: currentInput }
    ];

    console.log('发送消息历史:', messageHistory);

    // 使用流式API调用大模型
    setIsStreaming(true);
    setStreamingMessage('');
    
    let fullResponse = '';
    console.log('开始流式调用...');
    
      try {
      const stream = chatAPI.sendMessageStream(messageHistory, {
        maxTokens: 1000,
        temperature: 0.7,
        topP: 0.9
      });

      for await (const chunk of stream) {
        console.log('收到完整chunk数据:', chunk);
        
        // 使用类型断言告诉TypeScript chunk的类型
        const streamChunk = chunk as StreamChunk;
        
        let token = '';
        if (streamChunk.token) {
          token = streamChunk.token;
        } else if (streamChunk.choices?.[0]?.delta?.content) {
          token = streamChunk.choices[0].delta.content;
        } else if (streamChunk.content) {
          token = streamChunk.content;
        } else if (streamChunk.text) {
          token = streamChunk.text;
        }
        
        if (token) {
          fullResponse += token;
          // 使用函数式更新确保状态正确
          setStreamingMessage(fullResponse);
          
          // 添加微小延迟确保UI更新
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
      }
    } catch (streamError) {
      console.error('流式调用失败:', streamError);
      // 回退到普通API
      const response = await chatAPI.sendMessage(messageHistory, {
        maxTokens: 1000,
        temperature: 0.7,
        topP: 0.9
      });
      fullResponse = response.message || '抱歉，无法获取回复';
      setStreamingMessage(fullResponse);
    }
    
    console.log('完整回复:', fullResponse);

    // 添加完整的回复到消息列表
    const agentMessage: Message = {
      id: (Date.now() + 1).toString(),
      type: 'agent',
      content: fullResponse,
      timestamp: new Date().toLocaleTimeString(),
      status: 'sent',
    };
    setMessages(prev => [...prev, agentMessage]);
    
  } catch (error) {
    console.error('发送消息失败:', error);
    const errorMessage: Message = {
      id: (Date.now() + 1).toString(),
      type: 'agent',
      content: '抱歉，我暂时无法回复您的消息。请检查后端服务状态或稍后重试。',
      timestamp: new Date().toLocaleTimeString(),
      status: 'error',
    };
    setMessages(prev => [...prev, errorMessage]);
  } finally {
    setIsLoading(false);
    setIsStreaming(false);
    setStreamingMessage('');
  }
};


  const handleQuickQuestion = (question: string) => {
    setInputValue(question);
  };

  // 切换模型
  const switchModel = async (modelName: string) => {
    try {
      setIsLoading(true);
      await modelAPI.switchModel(modelName);
      await initializeData(); // 重新加载数据
      message.success(`已切换到模型: ${modelName}`);
    } catch (error) {
      console.error('切换模型失败:', error);
      message.error('切换模型失败，请检查服务状态');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: '1',
        type: 'agent',
        content: '对话历史已清空。有什么新的问题需要我帮助您吗？',
        timestamp: new Date().toLocaleTimeString(),
        status: 'sent',
      },
    ]);
  };

  const handleSettingsOk = () => {
    settingsForm.validateFields().then((values) => {
      console.log('设置更新:', values);
      setIsSettingsVisible(false);
    });
  };

  const handleUploadModalOk = () => {
    uploadForm.validateFields().then((values) => {
      console.log('上传配置:', values);
      // 模拟创建推理任务
      const newTask: InferenceTask = {
        id: Date.now().toString(),
        fileName: values.fileName || 'uploaded_file',
        fileType: values.fileType,
        model: values.model,
        status: 'pending',
        progress: 0,
        startTime: new Date().toLocaleTimeString(),
      };
      
      setInferenceTasks(prev => [...prev, newTask]);
      setIsUploadModalVisible(false);
      uploadForm.resetFields();
      
      // 模拟任务处理过程
      simulateTaskProcessing(newTask.id);
      
      message.success('文件上传成功，推理任务已创建！');
    });
  };

  const simulateTaskProcessing = (taskId: string) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 20;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        
        setInferenceTasks(prev => prev.map(task => 
          task.id === taskId 
            ? { 
                ...task, 
                progress: 100, 
                status: 'completed', 
                endTime: new Date().toLocaleTimeString(),
                result: generateInferenceResult(task.fileType, task.model)
              }
            : task
        ));
      } else {
        setInferenceTasks(prev => prev.map(task => 
          task.id === taskId 
            ? { ...task, progress, status: 'processing' }
            : task
        ));
      }
    }, 500);
  };

  const generateInferenceResult = (fileType: string, model: string): string => {
    const results: Record<string, Record<string, string>> = {
      image: {
        'ResNet-50': '识别结果：猫 (置信度: 95.2%), 沙发 (置信度: 87.1%), 窗户 (置信度: 76.3%)',
        'YOLO-v8': '检测到3个物体：人 (置信度: 92.1%), 汽车 (置信度: 88.7%), 交通标志 (置信度: 85.4%)',
        'EfficientNet': '分类结果：风景照片 (置信度: 91.8%), 自然场景 (置信度: 89.2%)',
      },
      text: {
        'BERT': '情感分析：积极 (置信度: 78.5%), 主题：技术讨论, 关键词：AI, 机器学习, 创新',
        'Qwen-7B': '文本摘要：这是一篇关于人工智能发展的技术文章，主要讨论了机器学习的应用前景。',
      },
      video: {
        '3D-CNN': '行为识别：走路 (置信度: 89.1%), 挥手 (置信度: 76.8%), 场景：办公室',
        'LSTM': '序列分析：检测到5个关键动作，时间序列模式识别完成',
      },
      audio: {
        'Whisper': '语音转文字：你好，欢迎使用智能语音识别系统。识别准确率：94.2%',
        'Wav2Vec': '说话人识别：男性，年龄约30-35岁，情感状态：平静',
      },
    };
    
    return results[fileType]?.[model] || '分析完成，结果已生成';
  };

  const handleCommandModalOk = () => {
    commandForm.validateFields().then((values) => {
      console.log('执行指令:', values);
      setIsCommandModalVisible(false);
      commandForm.resetFields();
      
      // 将指令作为用户消息发送
      const commandMessage = `${values.commandType} ${values.commandTarget}`;
      setInputValue(commandMessage);
      handleSendMessage();
    });
  };

  const getAgentStatus = (status: string) => {
    const statusMap = {
      online: { color: 'success', text: '在线' },
      offline: { color: 'default', text: '离线' },
      busy: { color: 'processing', text: '忙碌' },
    };
    return statusMap[status as keyof typeof statusMap];
  };

  const currentAgent = agentModels.find(agent => agent.id === selectedAgent);

  return (
    <ThemeProvider theme={theme}>
      <ChatContainer>
        <div style={{ height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column',flex: 1,
        minHeight: '600px', minWidth: '320px' }}>
          <Title level={3} style={{ marginBottom: 16 }}>智能Agent助手</Title>
          
          {/* Agent选择和状态 */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <Row gutter={16} align="middle">
              <Col span={8}>
                <Space>
                  <Text strong>当前Agent:</Text>
                  <Select 
                    value={selectedAgent} 
                    onChange={setSelectedAgent}
                    style={{ width: 200 }}
                  >
                    {agentModels.map(agent => (
                      <Option key={agent.id} value={agent.id}>
                        <Space>
                          <Badge 
                            status={getAgentStatus(agent.status).color as any} 
                            text={agent.name}
                          />
                        </Space>
                      </Option>
                    ))}
                  </Select>
                </Space>
              </Col>
              <Col span={12}>
                <Text type="secondary">{currentAgent?.description}</Text>
              </Col>
              <Col xs={24} sm={12} md={8} lg={6} xl={4}>
                <ResponsiveToolbarContainer>
                  {/* 文件上传 - 单独一行 */}
                  <div style={{ width: '100%', marginBottom: '8px' }}>
                    <Tooltip title="文件上传">
                      <ResponsiveIconButton
                        icon={<UploadOutlined />}
                        onClick={() => setIsUploadModalVisible(true)}
                        type="primary"
                        size="small"
                        style={{ width: '100%' }}
                      >
                        <span className="responsive-text">文件上传</span>
                      </ResponsiveIconButton>
                    </Tooltip>
                  </div>
                  
                  {/* 指令执行 - 单独一行 */}
                  <div style={{ width: '100%', marginBottom: '8px' }}>
                    <Tooltip title="指令执行">
                      <ResponsiveIconButton
                        icon={<PlayCircleOutlined />}
                        onClick={() => setIsCommandModalVisible(true)}
                        size="small"
                        style={{ width: '100%' }}
                      >
                        <span className="responsive-text">指令执行</span>
                      </ResponsiveIconButton>
                    </Tooltip>
                  </div>
                  
                  {/* 清空对话和设置 - 并排一行 */}
                  <div style={{ 
                    display: 'flex', 
                    width: '100%', 
                    gap: '8px',
                    justifyContent: 'space-between'
                  }}>
                    <Tooltip title="清空对话">
                      <ResponsiveIconButton
                        icon={<ClearOutlined />}
                        onClick={handleClearHistory}
                        size="small"
                        style={{ flex: 1 }}
                      />
                    </Tooltip>
                    <Tooltip title="设置">
                      <ResponsiveIconButton
                        icon={<SettingOutlined />}
                        onClick={() => setIsSettingsVisible(true)}
                        size="small"
                        style={{ flex: 1 }}
                      />
                    </Tooltip>
                  </div>
                </ResponsiveToolbarContainer>
              </Col>
            </Row>
            {currentAgent && (
              <div style={{ marginTop: 8 }}>
                <Text strong>能力特长: </Text>
                {currentAgent.capabilities.map((capability, index) => (
                  <Tag key={index} color="blue" style={{ marginRight: 4 }}>
                    {capability}
                  </Tag>
                ))}
              </div>
            )}
            
            {/* 模型状态显示 */}
            <div style={{ marginTop: 8 }}>
              <Text strong>模型状态: </Text>
              {currentModel ? (
                <Tag color="green">当前模型: {currentModel.name}</Tag>
              ) : (
                <Tag color="orange">未加载模型</Tag>
              )}
              {healthStatus && (
                <Tag color={healthStatus.status === 'healthy' ? 'green' : 'red'}>
                  {healthStatus.status === 'healthy' ? '服务正常' : '服务异常'}
                </Tag>
              )}
            </div>
          </Card>

          <Row 
          gutter={[16, 16]} 
          style={{ 
            flex: 1, // 允许扩展
            display: 'flex',
            minHeight: 0, // 重要：允许收缩
            width: '100%',
            margin: 0,
            alignItems: 'stretch' // 让子项拉伸填充高度
          }}
        >
            {/* 主对话区域 */}
            <Col xs={24} lg={16}>
              <Card 
                title="对话区域" 
                size="small"
                style={{ flex: 1, // 填充可用空间
                display: 'flex', 
                flexDirection: 'column',
                minHeight: '400px' }}
                bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px' }}
              >
                {/* 消息列表 */}
                <div style={{ 
                  flex: 1, 
                  overflowY: 'auto', 
                  marginBottom: 'clamp(8px, 2vw, 16px)',
                  padding: 'clamp(4px, 1vw, 8px)',
                  backgroundColor: '#fafafa',
                  borderRadius: '6px',
                  maxHeight: 'min(450px, 65vh)',
                   minHeight: '200px'
                }} className="messages-container">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className="message-item"
                      style={{
                        display: 'flex',
                        justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start',
                        marginBottom: 16,
                      }}
                    >
                      <div style={{ maxWidth: '70%', display: 'flex', alignItems: 'flex-start' }}>
                        {message.type === 'agent' && (
                          <Avatar 
                            icon={<RobotOutlined />} 
                            style={{ marginRight: 8, backgroundColor: '#1890ff' }}
                          />
                        )}
                        <MessageBubble isUser={message.type === 'user'}>
                          <div style={{
                            padding: '12px 16px',
                            whiteSpace: 'pre-wrap',
                            lineHeight: 1.5,
                            color: message.type === 'user' ? '#ffffff' : '#000000',
                          }}>
                            {message.content}
                          </div>
                        </MessageBubble>
                        {message.type === 'user' && (
                          <Avatar 
                            icon={<UserOutlined />} 
                            style={{ marginLeft: 8, backgroundColor: '#52c41a' }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                        <Avatar 
                          icon={<RobotOutlined />} 
                          style={{ marginRight: 8, backgroundColor: '#1890ff' }}
                        />
                        <MessageBubble isUser={false}>
                          <div style={{
                            padding: '12px 16px',
                            whiteSpace: 'pre-wrap',
                            lineHeight: 1.5,
                            color: '#000000',
                          }}>
                            {isStreaming && streamingMessage ? streamingMessage : '正在思考中...'}
                        </div>
                        </MessageBubble>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* 输入区域 */}
                <Space.Compact style={{ 
                width: '100%',
                gap: '8px'
              }}>
                <TextArea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onPressEnter={(e) => {
                    if (!e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="请输入您的问题... (Shift+Enter换行)"
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  style={{ 
                    resize: 'none',
                    fontSize: 'clamp(14px, 2vw, 16px)'
                  }}
                />
                <Button 
                  type="primary" 
                  icon={<SendOutlined />}
                  onClick={handleSendMessage}
                  loading={isLoading}
                  disabled={!inputValue.trim()}
                  style={{
                    minWidth: '60px',
                    minHeight: '44px'
                  }}
                >
                  发送
                </Button>
              </Space.Compact>
              </Card>
            </Col>

            {/* 右侧快捷操作 */}
            <Col xs={24} lg={8}>
              <Tabs defaultActiveKey="models" size="small" style={{ 
                flex: 1, // 填充高度
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0
              }}>
                <Tabs.TabPane tab="模型管理" key="models">
                  <Card size="small" style={{ 
                    height: 'calc(100% - 40px)',
                    minHeight: '180px'
                  }}>
                    <div style={{ maxHeight: '100%', overflowY: 'auto' }}>
                      {availableModels.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                          <RobotOutlined style={{ fontSize: '24px', marginBottom: '8px' }} />
                          <div>暂无可用模型</div>
                          <div style={{ fontSize: '12px' }}>请检查后端服务状态</div>
                        </div>
                      ) : (
                        <List
                          size="small"
                          dataSource={availableModels}
                          renderItem={(model: any) => (
                            <List.Item style={{ padding: '8px 0' }}>
                              <div style={{ width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                  <Text strong style={{ fontSize: '12px' }}>{model.name}</Text>
                                  <Tag 
                                    color={model.is_current ? 'green' : model.is_loaded ? 'blue' : 'default'}
                                  >
                                    {model.is_current ? '当前' : model.is_loaded ? '已加载' : '未加载'}
                                  </Tag>
                                </div>
                                <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
                                  {model.size && `大小: ${model.size}`}
                                </div>
                                {!model.is_current && (
                                  <Button
                                    size="small"
                                    type="primary"
                                    onClick={() => switchModel(model.name)}
                                    loading={isLoading}
                                    style={{ fontSize: '11px', height: '20px' }}
                                  >
                                    切换到此模型
                                  </Button>
                                )}
                              </div>
                            </List.Item>
                          )}
                        />
                      )}
                    </div>
                  </Card>
                </Tabs.TabPane>
                
                <Tabs.TabPane tab="快捷问题" key="quick">
                  <Card size="small" style={{ 
                      height: 'calc(100% - 40px)',
                      minHeight: '200px'
                    }}>
                    <div style={{ maxHeight: '100%', overflowY: 'auto' }}>
                      {quickQuestions.map((category, index) => (
                        <div key={index}>
                          <div style={{ marginBottom: 8 }}>
                            <Text strong>
                              {category.icon}
                              <span style={{ marginLeft: 8 }}>{category.category}</span>
                            </Text>
                          </div>
                          <List
                            size="small"
                            dataSource={category.questions}
                            renderItem={(question) => (
                              <List.Item style={{ padding: '4px 0' }}>
                                <Button
                                  type="link"
                                  size="small"
                                  onClick={() => handleQuickQuestion(question)}
                                  style={{ 
                                    height: 'auto', 
                                    padding: '4px 8px', 
                                    textAlign: 'left',
                                    whiteSpace: 'normal',
                                    lineHeight: 1.4
                                  }}
                                >
                                  {question}
                                </Button>
                              </List.Item>
                            )}
                          />
                          {index < quickQuestions.length - 1 && <Divider style={{ margin: '12px 0' }} />}
                        </div>
                      ))}
                    </div>
                  </Card>
                </Tabs.TabPane>
                
                <Tabs.TabPane tab="推理任务" key="tasks">
                  <Card size="small" style={{ 
                      height: 'calc(100% - 40px)',
                      minHeight: '200px'
                    }}>
                    <div style={{ maxHeight: '100%', overflowY: 'auto' }}>
                      {inferenceTasks.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                          <FileImageOutlined style={{ fontSize: '24px', marginBottom: '8px' }} />
                          <div>暂无推理任务</div>
                          <div style={{ fontSize: '12px' }}>点击"文件上传"开始分析</div>
                        </div>
                      ) : (
                        <List
                          size="small"
                          dataSource={inferenceTasks}
                          renderItem={(task) => (
                            <List.Item style={{ padding: '8px 0' }}>
                              <div style={{ width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                  <Text strong style={{ fontSize: '12px' }}>{task.fileName}</Text>
                                  <Tag 
                                    color={
                                      task.status === 'completed' ? 'success' : 
                                      task.status === 'processing' ? 'processing' : 
                                      task.status === 'failed' ? 'error' : 'default'
                                    }
                                  >
                                    {task.status === 'completed' ? '完成' : 
                                     task.status === 'processing' ? '处理中' : 
                                     task.status === 'failed' ? '失败' : '等待中'}
                                  </Tag>
                                </div>
                                <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
                                  {task.model} • {task.fileType} • {task.startTime}
                                </div>
                                {task.status === 'processing' && (
                                  <Progress 
                                    percent={Math.round(task.progress)} 
                                    size="small" 
                                    showInfo={false}
                                    style={{ marginBottom: '4px' }}
                                  />
                                )}
                                {task.status === 'completed' && task.result && (
                                  <div style={{ 
                                    fontSize: '11px', 
                                    color: '#52c41a', 
                                    backgroundColor: '#f6ffed',
                                    padding: '4px 6px',
                                    borderRadius: '4px',
                                    border: '1px solid #b7eb8f'
                                  }}>
                                    {task.result}
                                  </div>
                                )}
                              </div>
                            </List.Item>
                          )}
                        />
                      )}
                    </div>
                  </Card>
                </Tabs.TabPane>
              </Tabs>
            </Col>
          </Row>

          {/* 文件上传模态框 */}
          <Modal
            title="智能模型推理"
            open={isUploadModalVisible}
            onOk={handleUploadModalOk}
            onCancel={() => setIsUploadModalVisible(false)}
            okText="开始分析"
            cancelText="取消"
            width={600}
          >
            <Form form={uploadForm} layout="vertical">
              <Form.Item
                name="fileType"
                label="文件类型"
                rules={[{ required: true, message: '请选择文件类型' }]}
              >
                <Select placeholder="请选择要分析的文件类型">
                  <Option value="image">
                    <Space>
                      <FileImageOutlined />
                      图像文件 (JPG, PNG, BMP, TIFF)
                    </Space>
                  </Option>
                  <Option value="text">
                    <Space>
                      <FileTextIcon />
                      文本文件 (TXT, CSV, DOC)
                    </Space>
                  </Option>
                  <Option value="video">
                    <Space>
                      <VideoCameraOutlined />
                      视频文件 (MP4, AVI, MOV)
                    </Space>
                  </Option>
                  <Option value="audio">
                    <Space>
                      <AudioOutlined />
                      音频文件 (MP3, WAV, M4A)
                    </Space>
                  </Option>
                </Select>
              </Form.Item>
              
              <Form.Item
                name="model"
                label="推理模型"
                rules={[{ required: true, message: '请选择推理模型' }]}
              >
                <Select placeholder="请选择推理模型">
                  <Option value="ResNet-50">ResNet-50 (图像分类)</Option>
                  <Option value="YOLO-v8">YOLO-v8 (目标检测)</Option>
                  <Option value="EfficientNet">EfficientNet (高效图像分类)</Option>
                  <Option value="BERT">BERT (文本分析)</Option>
                  <Option value="Qwen-7B">Qwen-7B (大语言模型)</Option>
                  <Option value="3D-CNN">3D-CNN (视频分析)</Option>
                  <Option value="LSTM">LSTM (序列分析)</Option>
                  <Option value="Whisper">Whisper (语音识别)</Option>
                  <Option value="Wav2Vec">Wav2Vec (音频分析)</Option>
                </Select>
              </Form.Item>
              
              <Form.Item
                name="fileName"
                label="文件名称"
              >
                <Input placeholder="请输入文件名称（可选）" />
              </Form.Item>
              
              <Alert
                message="文件上传说明"
                description="支持拖拽上传，最大文件大小50MB。系统将自动选择合适的模型进行分析，并提供详细的推理结果。"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
            </Form>
          </Modal>

          {/* 指令执行模态框 */}
          <Modal
            title="智能指令执行"
            open={isCommandModalVisible}
            onOk={handleCommandModalOk}
            onCancel={() => setIsCommandModalVisible(false)}
            okText="执行"
            cancelText="取消"
            width={600}
          >
            <Form form={commandForm} layout="vertical">
              <Form.Item
                name="commandType"
                label="指令类型"
                rules={[{ required: true, message: '请选择指令类型' }]}
              >
                <Select placeholder="请选择要执行的指令类型">
                  {serviceCommands.map(cmd => (
                    <Option key={cmd.command} value={cmd.command}>
                      <Space>
                        {cmd.category === 'service' && <PlayCircleOutlined />}
                        {cmd.category === 'monitor' && <ThunderboltOutlined />}
                        {cmd.category === 'analysis' && <BulbOutlined />}
                        {cmd.category === 'system' && <SettingOutlined />}
                        {cmd.command}
                      </Space>
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              
              <Form.Item
                name="commandTarget"
                label="指令目标"
                rules={[{ required: true, message: '请输入指令目标' }]}
              >
                <Input placeholder="请输入指令的具体目标，如：Qwen-7B服务、GPU状态等" />
              </Form.Item>
              
              <div style={{ marginBottom: 16 }}>
                <Text strong>支持的指令示例：</Text>
                {serviceCommands.map(cmd => (
                  <div key={cmd.command} style={{ marginTop: 8 }}>
                    <Text strong style={{ color: '#1890ff' }}>{cmd.command}:</Text>
                    <div style={{ fontSize: '12px', color: '#666', marginTop: 4 }}>
                      {cmd.examples.map((example, index) => (
                        <div key={index}>• {example}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Form>
          </Modal>

          {/* 设置模态框 */}
          <Modal
            title="Agent设置"
            open={isSettingsVisible}
            onOk={handleSettingsOk}
            onCancel={() => setIsSettingsVisible(false)}
            okText="保存"
            cancelText="取消"
          >
            <Form form={settingsForm} layout="vertical">
              <Form.Item
                name="maxTokens"
                label="最大回复长度"
                initialValue={2048}
              >
                <Select>
                  <Option value={1024}>1024 tokens</Option>
                  <Option value={2048}>2048 tokens</Option>
                  <Option value={4096}>4096 tokens</Option>
                </Select>
              </Form.Item>
              <Form.Item
                name="temperature"
                label="创造性程度"
                initialValue={0.7}
              >
                <Select>
                  <Option value={0.1}>保守 (0.1)</Option>
                  <Option value={0.5}>平衡 (0.5)</Option>
                  <Option value={0.7}>创造 (0.7)</Option>
                  <Option value={0.9}>发散 (0.9)</Option>
                </Select>
              </Form.Item>
              <Form.Item
                name="enableHistory"
                label="启用对话历史"
                valuePropName="checked"
                initialValue={true}
              >
                <Switch />
              </Form.Item>
              <Form.Item
                name="autoSave"
                label="自动保存对话"
                valuePropName="checked"
                initialValue={false}
              >
                <Switch />
              </Form.Item>
            </Form>
          </Modal>
        </div>
      </ChatContainer>
    </ThemeProvider>
  );
};

// 修改主题配置对象
const theme: DefaultTheme = {
  colors: {
    primary: {
      light: '#40a9ff',
      main: '#1890ff',
      dark: '#096dd9',
      gradient: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)'
    },
    secondary: {
      light: '#73d13d',
      main: '#52c41a',
      dark: '#389e0d',
      gradient: 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)'
    },
    background: {
      default: '#f0f2f5',
      paper: '#ffffff',
      bubble: {
        user: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
        agent: 'linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%)'
      }
    },
    text: {
      primary: '#000000',
      secondary: '#666666',
      disabled: '#999999'
    },
    divider: '#f0f0f0',
    shadow: {
      light: '0 2px 8px rgba(0,0,0,0.05)',
      medium: '0 4px 12px rgba(0,0,0,0.1)',
      dark: '0 8px 16px rgba(0,0,0,0.15)'
    }
  },
  transitions: {
    duration: {
      short: '0.2s',
      medium: '0.3s',
      long: '0.5s'
    }
  }
};

// 修改 MessageBubble 组件使用主题
const MessageBubble = styled.div<{ isUser: boolean }>`
  animation: fadeIn ${props => props.theme.transitions.duration.medium} ease;
  background: ${props => 
    props.isUser 
      ? props.theme.colors.background.bubble.user 
      : props.theme.colors.background.bubble.agent};
  box-shadow: ${props => 
    props.isUser 
      ? props.theme.colors.shadow.medium 
      : props.theme.colors.shadow.light};
  border-radius: 12px;
  transition: transform ${props => props.theme.transitions.duration.short} ease;
  
  &:hover {
    transform: translateX(${props => props.isUser ? '-2px' : '2px'});
  }
  
  @keyframes fadeIn {
    from { 
      opacity: 0; 
      transform: translateY(10px); 
    }
    to { 
      opacity: 1; 
      transform: translateY(0); 
    }
  }
`;
// 响应式工具条容器
const ResponsiveToolbarContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: flex-end;
  align-items: center;
  padding: 0.5rem;
  
  @media (max-width: 768px) {
    justify-content: center;
    gap: 0.25rem;
  }
  
  @media (max-width: 480px) {
    .responsive-text {
      display: none;
    }
  }
`;

// 响应式图标按钮
const ResponsiveIconButton = styled(Button)`
  font-size: clamp(12px, 1.5vw, 16px);
  padding: clamp(4px, 1vw, 8px) clamp(8px, 1.5vw, 12px);
  min-height: 44px;
  min-width: 44px;
  
  .anticon {
    font-size: clamp(14px, 2vw, 18px);
  }
  
  @media (min-resolution: 200dpi) {
    padding: 12px;
    .anticon { 
      font-size: 20px; 
    }
  }
  
  @media (max-width: 480px) {
    flex: 1;
    min-width: auto;
  }
`;

// 响应式消息气泡
const ResponsiveMessageBubble = styled(MessageBubble)`
  img, video {
    max-width: 100%;
    height: auto;
  }
  
  font-size: clamp(14px, 2vw, 16px);
  line-height: 1.5;
`;

// 响应式断点配置
const breakpoints = {
  xs: '480px',
  sm: '576px',
  md: '768px',
  lg: '992px',
  xl: '1200px',
  xxl: '1600px'
};

// 添加滚动容器样式
const ChatContainer = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: clamp(8px, 2vw, 16px);
  
  // 添加最小尺寸限制
  min-width: 320px; // 设置最小宽度，防止过度缩小
  min-height: 500px; // 设置最小高度

  .messages-container {
    scroll-behavior: smooth;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
    
    &::-webkit-scrollbar {
      width: 6px;
    }
    
    &::-webkit-scrollbar-thumb {
      background-color: rgba(0, 0, 0, 0.2);
      border-radius: 3px;
      
      &:hover {
        background-color: rgba(0, 0, 0, 0.3);
      }
    }
    
    &::-webkit-scrollbar-track {
      background-color: transparent;
    }
    
    // 响应式字体大小
    font-size: clamp(14px, 2vw, 16px);
    min-font-size: 12px; // 最小字体大小
  }
  
  .message-item {
    transition: all ${props => props.theme.transitions.duration.medium} ease;
    
    &:hover {
      transform: translateX(4px);
    }
  }
  
  .message-input {
    transition: all ${props => props.theme.transitions.duration.short} ease;
    font-size: clamp(14px, 2vw, 16px);
    min-font-size: 12px;
    
    &:focus {
      transform: translateY(-2px);
      box-shadow: ${props => props.theme.colors.shadow.medium};
    }
  }
  
  .send-button {
    transition: all ${props => props.theme.transitions.duration.short} ease;
    min-height: 44px;
    min-width: 60px;
    
    &:hover:not(:disabled) {
      transform: scale(1.05);
    }
    
    &:active:not(:disabled) {
      transform: scale(0.95);
    }
  }
    .ant-card {
    min-height: 200px; // 卡片最小高度
  }
  
  .ant-tabs {
    min-height: 300px; // Tab容器最小高度
  }
  
  // 响应式媒体查询
  @media (max-width: ${breakpoints.md}) {
    padding: 4px;
    
    .ant-col {
      margin-bottom: 8px;
    }
  }
  
  @media (max-width: ${breakpoints.sm}) {
    .messages-container {
      max-height: 40vh;
      min-height: 150px;
    }
      // 在小屏幕上确保元素不会太小
    .ant-btn {
      min-width: 44px;
      min-height: 44px;
    }
    
    .ant-input {
      min-height: 44px;
    }
      // 超小屏幕保护
  @media (max-width: 360px) {
    min-width: 320px; // 确保在非常小的屏幕上也有基本宽度
    overflow-x: auto; // 允许横向滚动
    
    .ant-row {
      min-width: 320px;
    }
  }
`;

import 'styled-components';

interface ThemeColors {
  primary: {
    light: string;
    main: string;
    dark: string;
    gradient: string;
  };
  secondary: {
    light: string;
    main: string;
    dark: string;
    gradient: string;
  };
  background: {
    default: string;
    paper: string;
    bubble: {
      user: string;
      agent: string;
    };
  };
  text: {
    primary: string;
    secondary: string;
    disabled: string;
  };
  divider: string;
  shadow: {
    light: string;
    medium: string;
    dark: string;
  };
}

interface ThemeTransitions {
  duration: {
    short: string;
    medium: string;
    long: string;
  };
}

export interface CustomTheme {
  colors: ThemeColors;
  transitions: ThemeTransitions;
}

declare module 'styled-components' {
  export interface DefaultTheme extends CustomTheme {}
}

export default AgentChatPage;
