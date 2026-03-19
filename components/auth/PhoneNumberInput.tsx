'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'

import {
  PHONE_COUNTRY_OPTIONS,
  changePhoneCountry,
  coercePhoneNumberInput,
  type PhoneNumberInputValue,
} from '@/lib/phone-number'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface PhoneNumberInputProps {
  id: string
  value: PhoneNumberInputValue
  onChange: (value: PhoneNumberInputValue) => void
  disabled?: boolean
  required?: boolean
  placeholder?: string
}

export default function PhoneNumberInput({
  id,
  value,
  onChange,
  disabled = false,
  required = false,
  placeholder = 'Phone number',
}: PhoneNumberInputProps) {
  const [isCountrySelectorOpen, setIsCountrySelectorOpen] = useState(false)

  const selectedCountry = useMemo(
    () =>
      PHONE_COUNTRY_OPTIONS.find((option) => option.country === value.country) ??
      PHONE_COUNTRY_OPTIONS[0],
    [value.country],
  )

  return (
    <div className="flex items-start gap-2">
      <Popover open={isCountrySelectorOpen} onOpenChange={setIsCountrySelectorOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={isCountrySelectorOpen}
            className="w-[120px] justify-between px-3 font-normal"
            disabled={disabled}
          >
            <span className="truncate">{selectedCountry.compactLabel}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search country or code..." />
            <CommandList>
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup>
                {PHONE_COUNTRY_OPTIONS.map((option) => (
                  <CommandItem
                    key={option.country}
                    value={`${option.name} +${option.callingCode} ${option.country}`}
                    onSelect={() => {
                      onChange(changePhoneCountry(value, option.country))
                      setIsCountrySelectorOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        'h-4 w-4',
                        option.country === value.country ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="flex-1 truncate">{option.name}</span>
                    <span className="text-xs text-muted-foreground">+{option.callingCode}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={placeholder}
        value={value.nationalNumber}
        onChange={(event) => onChange(coercePhoneNumberInput(event.target.value, value.country))}
        disabled={disabled}
        required={required}
        className="flex-1"
      />
    </div>
  )
}
