import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, Wifi, WifiOff, Loader } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

interface ConnectionSwitcherProps {
    onAddNew: () => void;
}

export function ConnectionSwitcher({ onAddNew }: ConnectionSwitcherProps) {
    const { data, activeConnection, connectionStatus, switchConnection } = useApp();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getStatusIcon = () => {
        switch (connectionStatus) {
            case 'connected':
                return <Wifi size={14} className="status-icon connected" />;
            case 'connecting':
                return <Loader size={14} className="status-icon connecting" />;
            case 'error':
                return <WifiOff size={14} className="status-icon error" />;
            default:
                return <WifiOff size={14} className="status-icon disconnected" />;
        }
    };

    const handleSelect = async (id: string) => {
        setIsOpen(false);
        if (id !== activeConnection?.id) {
            await switchConnection(id);
        }
    };

    const handleAddNew = () => {
        setIsOpen(false);
        onAddNew();
    };

    if (!activeConnection) return null;

    return (
        <div className="connection-switcher" ref={dropdownRef}>
            <button className="connection-switcher-button" onClick={() => setIsOpen(!isOpen)}>
                {getStatusIcon()}
                <span className="connection-name">{activeConnection.name}</span>
                <ChevronDown size={16} className={`chevron ${isOpen ? 'open' : ''}`} />
            </button>

            {isOpen && (
                <div className="connection-dropdown">
                    {data.connections.map((conn) => (
                        <button
                            key={conn.id}
                            className={`connection-option ${conn.id === activeConnection.id ? 'active' : ''}`}
                            onClick={() => handleSelect(conn.id)}
                        >
                            <span className="connection-option-name">{conn.name}</span>
                            <span className="connection-option-broker">{conn.broker_url}</span>
                        </button>
                    ))}
                    <div className="connection-dropdown-divider" />
                    <button className="connection-option add-new" onClick={handleAddNew}>
                        <Plus size={16} />
                        <span>Add Connection</span>
                    </button>
                </div>
            )}
        </div>
    );
}
