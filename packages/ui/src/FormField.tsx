import React, { useId } from 'react';

import { cx } from './cx';

export interface FormFieldProps {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  /** 渲染函数拿到 id（关联 label/hint）；或直接传单个表单元素，自动注入 id */
  children: React.ReactElement | ((ids: { id: string; describedBy?: string }) => React.ReactNode);
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  hint,
  error,
  className,
  children,
}) => {
  const id = useId();
  const hintId = `${id}-hint`;
  const describedBy = error != null || hint != null ? hintId : undefined;
  const control =
    typeof children === 'function'
      ? children({ id, describedBy })
      : React.cloneElement(
          children as React.ReactElement<{ id?: string; 'aria-describedby'?: string }>,
          {
            id: (children.props as { id?: string }).id ?? id,
            'aria-describedby': describedBy,
          },
        );
  const controlId =
    typeof children === 'function' ? id : ((children.props as { id?: string }).id ?? id);
  return (
    <div className={cx('cd-field', className)}>
      <label className="cd-field__label" htmlFor={controlId}>
        {label}
      </label>
      {control}
      {error != null ? (
        <span id={hintId} className="cd-field__error">
          {error}
        </span>
      ) : (
        hint != null && (
          <span id={hintId} className="cd-field__hint">
            {hint}
          </span>
        )
      )}
    </div>
  );
};
