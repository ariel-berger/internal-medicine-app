
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Filter, ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const SPECIALTIES = [
  "Cardiology", "Nephrology", "Endocrinology", "Pulmonology", 
  "Gastroenterology", "Rheumatology", "Infectious_Disease", 
  "Hematology", "Critical_Care", "General_Internal_Medicine", "Neurology"
];

const STUDY_TYPES = ["All", "RCT", "Observational", "Review", "Meta-analysis", "Case-Control", "Cohort", "Case Report"];

export default function SpecialtyFilter({ 
  selectedSpecialties, 
  onSpecialtyChange,
  selectedStudyType, 
  setSelectedStudyType
}) {

  const handleToggleSpecialty = (specialty) => {
    const newSelection = new Set(selectedSpecialties);
    if (newSelection.has(specialty)) {
      newSelection.delete(specialty);
    } else {
      newSelection.add(specialty);
    }
    onSpecialtyChange(newSelection);
  };

  const handleSelectAll = () => {
    onSpecialtyChange(new Set(SPECIALTIES));
  };

  const handleClearAll = () => {
    onSpecialtyChange(new Set());
  };

  const isAllSelected = selectedSpecialties.size === SPECIALTIES.length;

  return (
    <Card className="professional-card">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base text-slate-800">
          <Filter className="w-5 h-5 text-slate-500" />
          <span>Filters</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-semibold text-slate-700 mb-2 block">
            Medical Specialty
          </label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between border-slate-300 hover:bg-slate-50">
                <span>{selectedSpecialties.size} of {SPECIALTIES.length} selected</span>
                <ChevronDown className="w-4 h-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 border-slate-200">
                <div className="p-4 bg-slate-50">
                    <div className="flex items-center space-x-2">
                       <Checkbox
                        id="select-all-popover"
                        checked={isAllSelected}
                        onCheckedChange={isAllSelected ? handleClearAll : handleSelectAll}
                        className="border-slate-400 data-[state=checked]:bg-slate-800"
                      />
                      <label
                        htmlFor="select-all-popover"
                        className="text-sm font-medium leading-none text-slate-800 peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {isAllSelected ? 'Deselect All' : 'Select All'}
                      </label>
                    </div>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto border-t border-slate-200 p-4">
                  {SPECIALTIES.map((specialty) => (
                    <div key={specialty} className="flex items-center space-x-2 hover:bg-slate-50 p-1 rounded">
                      <Checkbox
                        id={`popover-${specialty}`}
                        checked={selectedSpecialties.has(specialty)}
                        onCheckedChange={() => handleToggleSpecialty(specialty)}
                        className="border-slate-400 data-[state=checked]:bg-slate-800"
                      />
                      <label
                        htmlFor={`popover-${specialty}`}
                        className="text-sm font-medium leading-none text-slate-700 peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {specialty.replace(/_/g, ' ')}
                      </label>
                    </div>
                  ))}
                </div>
            </PopoverContent>
          </Popover>
        </div>

        <div>
          <label className="text-sm font-semibold text-slate-700 mb-2 block">
            Study Type
          </label>
          <Select value={selectedStudyType} onValueChange={setSelectedStudyType}>
            <SelectTrigger className="border-slate-300 hover:bg-slate-50">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              {STUDY_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
