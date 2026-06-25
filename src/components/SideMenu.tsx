// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Title } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import cx from 'clsx';
import { Fragment } from 'react';
import type { JSX } from 'react';
import { NavLink, useLocation } from 'react-router';
import classes from './SideMenu.module.css';

export interface SubMenuProps {
  readonly name: string;
  readonly href: string;
}

export interface SideMenuProps {
  readonly title: string;
  readonly menu: { name: string; href: string; subMenu?: SubMenuProps[] }[];
}

export function SideMenu(props: SideMenuProps): JSX.Element {
  const { pathname } = useLocation();

  return (
    <div className={classes.container}>
      <Title order={4} className={classes.title}>
        {props.title}
      </Title>
      {props.menu.map((item) => {
        // Acordeón: solo el grupo cuya ruta está activa muestra sus sub-opciones.
        // El resto queda colapsado, así el menú entra en pantalla.
        const hasSub = !!item.subMenu?.length;
        const expanded = hasSub && (pathname === item.href || pathname.startsWith(`${item.href}/`));
        return (
          <Fragment key={item.href}>
            <NavLink
              to={item.href}
              end
              className={({ isActive }) => cx(classes.link, (isActive || expanded) && classes.linkActive)}
            >
              <span style={{ flex: 1 }}>{item.name}</span>
              {hasSub &&
                (expanded ? (
                  <IconChevronDown size={16} className={classes.chevron} />
                ) : (
                  <IconChevronRight size={16} className={classes.chevron} />
                ))}
            </NavLink>
            {expanded &&
              item.subMenu?.map((subItem) => (
                <div key={subItem.href} style={{ paddingLeft: 20 }}>
                  <NavLink
                    to={subItem.href}
                    className={({ isActive }) => cx(classes.link, isActive && classes.linkActive)}
                  >
                    <span>{subItem.name}</span>
                  </NavLink>
                </div>
              ))}
          </Fragment>
        );
      })}
    </div>
  );
}
