import {contextBridge,ipcRenderer} from 'electron';
import type {Bridge} from '../shared/types';
const bridge:Bridge = {
  state:()=>ipcRenderer.invoke('companion:state'),history:session=>ipcRenderer.invoke('companion:history',session),memory:()=>ipcRenderer.invoke('companion:memory'),
  action:(action,payload)=>ipcRenderer.invoke('companion:action',action,payload),
  on:(channel,cb)=>{
    if(!['state','stream','bubble','dialog','pointer'].includes(channel))throw new Error('不支持的消息类型');
    const listener=(_:unknown,data:any)=>cb(data);ipcRenderer.on('companion:'+channel,listener);
    return ()=>ipcRenderer.removeListener('companion:'+channel,listener);
  },hit:interactive=>ipcRenderer.send('companion:hit',interactive),drag:phase=>ipcRenderer.send('companion:drag',phase)
};
contextBridge.exposeInMainWorld('companion',bridge);
