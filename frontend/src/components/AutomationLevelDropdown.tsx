import { AutomationLevel } from '../types/models';

interface AutomationLevelDropdownProps {
  value: AutomationLevel;
  onChange: (level: AutomationLevel) => void;
}

const AutomationLevelDropdown = ({ value, onChange }: AutomationLevelDropdownProps) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '') {
      onChange(null);
    } else {
      onChange(Number(val) as AutomationLevel);
    }
  };

  return (
    <select value={value ?? ''} onChange={handleChange} className="automation-dropdown">
      <option value="">-</option>
      <option value={AutomationLevel.Off}>Off</option>
      <option value={AutomationLevel.Low}>Low</option>
      <option value={AutomationLevel.Regular}>Regular</option>
      <option value={AutomationLevel.High}>High</option>
      <option value={AutomationLevel.Top}>Top</option>
    </select>
  );
};

export default AutomationLevelDropdown;
