

import React from "react";
import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Activity, BookOpen, Crown, Library, Trash2, Plus, LogOut, User as UserIcon, FileText } from "lucide-react";
import { GenerateImage } from "@/api/integrations";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User } from "@/api/entities";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const SUPER_ADMIN_EMAIL = "medicortex-owner@berri.ai";

const navigationItems = [
  {
    title: "Dashboard",
    url: createPageUrl("Dashboard"),
    icon: Activity,
  },
  {
    title: "All Studies",
    url: createPageUrl("AllStudies"),
    icon: BookOpen,
  },
  {
    title: "Case Reports",
    url: createPageUrl("CaseReports"),
    icon: FileText,
  },
  {
    title: "My Library",
    url: createPageUrl("MyLibrary"),
    icon: Library,
  },
  {
    title: "Add Study",
    url: createPageUrl("AddStudy"),
    icon: Plus,
  },
];

const adminNavItems = [
  {
    title: "Admin Dashboard",
    url: createPageUrl("AdminDashboard"),
    icon: Crown,
    colorClass: "amber",
  },
  {
    title: "Data Management",
    url: createPageUrl("DataManagement"),
    icon: Trash2,
    colorClass: "red",
  },
];

export default function Layout({ children, currentPageName }) {
  const location = useLocation();
  const [currentUser, setCurrentUser] = React.useState(null);
  const [logoUrl, setLogoUrl] = React.useState(null);

  React.useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await User.me();
        setCurrentUser(user);
      } catch (error) {
        setCurrentUser(null);
        // Redirect to login if not authenticated
        window.location.href = '/login';
      }
    };
    loadUser();
  }, []);

  React.useEffect(() => {
    const generateLogo = async () => {
      try {
        const result = await GenerateImage({
          prompt: "Create a simple, modern logo. The logo should feature the text 'Internal Nerds' in a cool, stylish, and professional sans-serif font. The text should be white and centered inside a solid-colored square with rounded corners. The square's color should be a professional deep teal blue. Flat design, vector style, no gradients or extra effects."
        });
        setLogoUrl(result.url);
      } catch (error) {
        console.error("Failed to generate logo:", error);
      }
    };
    generateLogo();
  }, []);

  const handleLogout = async () => {
    await User.logout();
    window.location.reload();
  };

  const isAdmin = currentUser?.role === 'admin';
  const isSuperAdmin = currentUser?.email === SUPER_ADMIN_EMAIL;

  return (
    <SidebarProvider>
      <style>
        {`
          .professional-card {
            background: white;
            border: 1px solid #e2e8f0; /* slate-200 */
            box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
            border-radius: 0.75rem; /* rounded-xl */
            transition: all 0.2s ease-in-out;
          }
          
          .professional-card:hover {
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
            border-color: #cbd5e1; /* slate-300 */
          }

          .nav-item-active {
            background-color: #f1f5f9; /* slate-100 */
            color: #0f172a; /* slate-900 */
            font-weight: 600;
          }
          
          .nav-item-inactive {
            color: #475569; /* slate-600 */
          }
          
          .nav-item-inactive:hover {
            background-color: #f8fafc; /* slate-50 */
            color: #0f172a; /* slate-900 */
          }
        `}
      </style>
      <div className="flex h-screen w-full bg-slate-50 overflow-hidden">
        <Sidebar className="border-r border-slate-200 bg-white w-60">
          <SidebarHeader className="border-b border-slate-200 p-4 flex items-center gap-3">
             {logoUrl ? (
                <img src={logoUrl} alt="Internal Nerds Logo" className="w-10 h-10 rounded-lg" />
              ) : (
                <Skeleton className="w-10 h-10 rounded-lg" />
              )}
              <div>
                 <h1 className="text-lg font-bold text-slate-800">Internal Nerds</h1>
              </div>
          </SidebarHeader>
          
          <SidebarContent className="p-4">
            <SidebarGroup>
              <SidebarGroupLabel className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-2">
                Navigation
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="space-y-1">
                  {navigationItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton 
                        asChild 
                        className={`transition-all duration-200 rounded-lg ${
                          location.pathname === item.url ? 'nav-item-active' : 'nav-item-inactive'
                        }`}
                      >
                        <Link to={item.url} className="flex items-center gap-3 px-3 py-2.5">
                          <item.icon className="w-5 h-5" />
                          <span className="font-medium">{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {isAdmin && (
              <SidebarGroup className="mt-4">
                <SidebarGroupLabel className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-3 py-2">
                  Admin Tools
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="space-y-1">
                    {adminNavItems.map((item) => {
                      if (item.title === "Data Management" && !isSuperAdmin) {
                        return null;
                      }
                      return (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton
                            asChild
                             className={`transition-all duration-200 rounded-lg ${
                              location.pathname === item.url ? 'nav-item-active' : 'nav-item-inactive'
                            }`}
                          >
                            <Link to={item.url} className="flex items-center gap-3 px-3 py-2.5">
                              <item.icon className={`w-5 h-5 text-${item.colorClass}-600`} />
                              <span className="font-medium">{item.title}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </SidebarContent>

          <SidebarFooter className="border-t border-slate-200 p-4">
             <p className="text-xs text-slate-500 text-center">© 2024 Internal Nerds</p>
          </SidebarFooter>
        </Sidebar>

        <div className="flex-1 flex flex-col">
          <header className="bg-white/80 backdrop-blur-sm border-b border-slate-200 px-6 py-3 shrink-0 sticky top-0 z-20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <SidebarTrigger className="md:hidden" />
                 <h1 className="text-xl font-bold text-slate-900">{currentPageName}</h1>
              </div>
              
              <div className="flex items-center gap-4">
                {currentPageName !== 'AddStudy' && (
                  <Link to={createPageUrl("AddStudy")}>
                    <Button className="bg-slate-800 text-white hover:bg-slate-900 transition-colors shadow-sm">
                      <Plus className="w-4 h-4 mr-0 sm:mr-2" />
                      <span className="hidden sm:inline">Add Study</span>
                    </Button>
                  </Link>
                )}

                {currentUser && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="relative h-10 w-10 rounded-full hover:bg-slate-100">
                        <UserIcon className="h-5 w-5 text-slate-600" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end" forceMount>
                      <DropdownMenuLabel className="font-normal">
                        <div className="flex flex-col space-y-1">
                          <p className="text-sm font-medium leading-none">
                            {currentUser.full_name || 'User'}
                          </p>
                          <p className="text-xs leading-none text-muted-foreground">
                            {currentUser.email}
                          </p>
                        </div>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Log out</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto">
            <div className="max-w-7xl mx-auto w-full p-4 md:p-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

